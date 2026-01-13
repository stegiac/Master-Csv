
import { GoogleGenAI } from "@google/genai";
import { SchemaField, DataSourceType, SourceInfo, FieldStatus } from '../types';
import { PIPELINE_VERSION } from '../constants';

// Pulizia del testo JSON restituito dall'AI
const cleanJson = (text: string | undefined) => {
  if (!text) return "{}";
  try {
    const match = text.match(/\{[\s\S]*\}/) || text.match(/\[[\s\S]*\]/);
    if (!match) return text.trim();
    return match[0].replace(/```json/g, '').replace(/```/g, '').trim();
  } catch (e) {
    return "{}";
  }
};

export const checkApiHealth = async (): Promise<{online: boolean, error?: string}> => {
  const key = process.env.API_KEY;
  if (!key || key === "undefined" || key === "") {
    return { 
      online: false, 
      error: "API_KEY non configurata nelle impostazioni della build." 
    };
  }
  return { online: true };
};

export const processProductWithGemini = async (params: any): Promise<any> => {
  const finalValues: Record<string, string> = {};
  const finalAudit: Record<string, SourceInfo> = {};

  // Priorità dati locali (Excel/Mapping)
  params.schema.forEach((field: SchemaField) => {
    let rawVal = params.mappedValues[field.id] || params.manufacturerData?.[field.name];
    if (rawVal) {
      finalValues[field.name] = String(rawVal);
      finalAudit[field.name] = {
        source: 'Dati Sorgente (Excel)', 
        sourceType: 'MANUFACTURER', 
        status: 'LOCKED', 
        confidence: 'high',
        warnings: [], 
        pipelineVersion: PIPELINE_VERSION
      };
    }
  });

  const missingFields = params.schema.filter((f: SchemaField) => f.enabled && !finalValues[f.name]);
  if (missingFields.length === 0) return { values: finalValues, audit: finalAudit };

  // Chiamata diretta all'SDK Gemini nel browser
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Analizza SKU ${params.sku} (${params.brandName || 'Generico'}). 
      Campi richiesti: ${missingFields.map(f => f.name).join(',')}. 
      Contesto PDF: ${params.pdfContextData?.rawText?.substring(0, 15000) || 'Nessuno'}.`,
      config: {
        systemInstruction: "Sei un esperto catalogatore e-commerce. Estrai dati tecnici precisi. Rispondi rigorosamente in formato JSON con due chiavi: 'values' (campo: valore) e 'audit' (campo: {source, confidence}).",
        responseMimeType: "application/json",
        tools: [{ googleSearch: {} }]
      },
    });

    const text = response.text;
    const aiResult = JSON.parse(cleanJson(text) || '{"values":{},"audit":{}}');

    missingFields.forEach((field: SchemaField) => {
      const aiVal = aiResult.values?.[field.name];
      if (aiVal) {
        finalValues[field.name] = String(aiVal);
        finalAudit[field.name] = {
          source: aiResult.audit?.[field.name]?.source || "Google Search / Gemini AI",
          sourceType: 'AI', 
          status: 'ENRICHED', 
          confidence: aiResult.audit?.[field.name]?.confidence || 'medium',
          warnings: [], 
          pipelineVersion: PIPELINE_VERSION
        };
      }
    });
  } catch (error: any) {
    console.error("Gemini SDK Error:", error);
    throw new Error(`Errore AI: ${error.message}`);
  }

  return { values: finalValues, audit: finalAudit };
};

export const generateFieldExplanation = async (field: SchemaField): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Spiega brevemente cos'è il campo "${field.name}" (${field.description}) per un prodotto e-commerce. Sii sintetico.`,
    });
    return response.text || "";
  } catch (e) {
    return "Spiegazione non disponibile.";
  }
};

export const generateSchemaFromHeaders = async (headers: string[]): Promise<SchemaField[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Analizza queste intestazioni di un file Excel e crea uno schema di mappatura e-commerce: ${headers.join(', ')}`,
      config: {
        systemInstruction: "Genera un array JSON di oggetti con proprietà: name, description, prompt, fieldClass (HARD/SOFT).",
        responseMimeType: "application/json"
      }
    });
    
    const text = response.text;
    const parsed = JSON.parse(cleanJson(text));
    return parsed.map((f: any, i: number) => ({
      ...f, 
      id: `ai-${Date.now()}-${i}`, 
      enabled: true, 
      strict: f.fieldClass === 'HARD',
      fillPolicy: 'ALLOW_INFER', 
      allowedValues: [], 
      isCustom: true
    }));
  } catch (e) {
    console.error(e);
    return [];
  }
};
