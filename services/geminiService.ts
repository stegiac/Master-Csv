
import { SchemaField, DataSourceType, SourceInfo, Warning, FieldStatus, WarningAction } from '../types';
import { PIPELINE_VERSION } from '../constants';

const cleanJson = (text: string) => {
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
  try {
    // Usiamo cache: 'no-store' per evitare che Hostinger/Browser servano una risposta vecchia
    const res = await fetch('/api/health', { cache: 'no-store' });
    
    if (res.status === 404) {
      return { online: false, error: "Errore 404: Il server Node non riceve le richieste API. Controlla il Proxy." };
    }

    if (!res.ok) return { online: false, error: `Status ${res.status}` };
    
    const data = await res.json();
    return { 
      online: data.status === 'online', 
      error: data.apiKeyConfigured ? undefined : "Attenzione: API_KEY non configurata nel server" 
    };
  } catch (e) {
    return { online: false, error: "Connessione rifiutata. Server Node.js spento o crashato." };
  }
};

const callGeminiProxy = async (action: string, payload: any) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s per ricerche web profonde

  try {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ action, payload }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.status === 404) {
      throw new Error("Il server ha risposto con 404. La configurazione Node.js su Hostinger non è corretta.");
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      throw new Error("Risposta non valida dal server (atteso JSON, ricevuto altro).");
    }

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Errore Server ${response.status}`);
    return data;
  } catch (e: any) {
    if (e.name === 'AbortError') throw new Error("L'operazione AI ha impiegato troppo tempo (Timeout 60s)");
    throw e;
  }
};

export const processProductWithGemini = async (params: any): Promise<any> => {
  const finalValues: Record<string, string> = {};
  const finalAudit: Record<string, SourceInfo> = {};

  params.schema.forEach((field: SchemaField) => {
    let rawVal = params.mappedValues[field.id] || params.manufacturerData?.[field.name];
    if (rawVal) {
      finalValues[field.name] = String(rawVal);
      finalAudit[field.name] = {
        source: 'Excel', sourceType: 'MANUFACTURER', status: 'LOCKED', confidence: 'high',
        warnings: [], pipelineVersion: PIPELINE_VERSION
      };
    }
  });

  const missingFields = params.schema.filter((f: SchemaField) => f.enabled && !finalValues[f.name]);
  if (missingFields.length === 0) return { values: finalValues, audit: finalAudit };

  const proxyResult = await callGeminiProxy('process', { ...params, missingFields });
  const aiResult = JSON.parse(cleanJson(proxyResult.data) || '{"values":{},"audit":{}}');

  missingFields.forEach((field: SchemaField) => {
    const aiVal = aiResult.values?.[field.name];
    if (aiVal) {
      finalValues[field.name] = String(aiVal);
      finalAudit[field.name] = {
        source: aiResult.audit?.[field.name]?.source || "Ricerca AI",
        sourceType: 'AI', status: 'ENRICHED', confidence: 'medium',
        warnings: [], pipelineVersion: PIPELINE_VERSION
      };
    }
  });

  return { values: finalValues, audit: finalAudit };
};

export const generateFieldExplanation = async (field: SchemaField): Promise<string> => {
  const res = await callGeminiProxy('explain', { fieldName: field.name, description: field.description });
  return res.data;
};

export const generateSchemaFromHeaders = async (headers: string[]): Promise<SchemaField[]> => {
  const res = await callGeminiProxy('generateSchema', { headers });
  const parsed = JSON.parse(cleanJson(res.data));
  return parsed.map((f: any, i: number) => ({
    ...f, id: `ai-${Date.now()}-${i}`, enabled: true, strict: f.fieldClass === 'HARD',
    fillPolicy: 'ALLOW_INFER', allowedValues: [], isCustom: true
  }));
};
