
import { SchemaField, DataSourceType, SourceInfo, Warning, FieldStatus, WarningAction } from '../types';
import { PIPELINE_VERSION } from '../constants';

const COLOR_MAP: Record<string, string> = {
  'antracite': 'Grigio Scuro',
  'finitura acciaio': 'Acciaio Inox',
  'bianco opaco': 'Bianco',
  'nero goffrato': 'Nero',
  'cromo': 'Cromato',
  'titanio': 'Grigio Titanio'
};

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

interface StandardizedResult {
  value: string;
  warnings: Warning[];
}

const standardizeValue = (value: string, field: SchemaField): StandardizedResult => {
  let v = String(value).trim();
  const lowerField = field.name.toLowerCase();
  const res: StandardizedResult = { value: v, warnings: [] };
  
  if (/^(null|n\/d|n\/a|vuoto|nd|nan|none|-$)$/i.test(v)) {
    return { value: "", warnings: [] };
  }

  // 1. IP CLASS DEEP NORMALIZATION (es: ip-44 -> IP44)
  if (lowerField.includes('ip')) {
    const ipMatch = v.match(/(?:IP)?\s?(\d{2})/i);
    if (ipMatch) res.value = `IP${ipMatch[1]}`;
  }

  // 2. ENERGY LABEL TRANSITION (A+++ -> A)
  if (lowerField.includes('energetica')) {
    const labelMatch = v.match(/[A-G]/i);
    if (labelMatch) {
      res.value = labelMatch[0].toUpperCase();
      if (v.includes('+')) {
        res.warnings.push({ 
          message: "Conversione scala obsoleta (A+++ -> A-G)", 
          severity: 'warn' 
        });
      }
    }
  }

  // 3. COMPOSITE DIMENSIONS (LxWxH) -> Normalizza tutto in cm
  if (lowerField.includes('altezza') || lowerField.includes('lunghezza') || lowerField.includes('larghezza') || lowerField.includes('misure')) {
    const hasMm = v.toLowerCase().includes('mm');
    const numbers = v.split(/[x*]/i).map(p => {
      const n = parseFloat(p.replace(/[^\d.]/g, '').replace(',', '.'));
      return isNaN(n) ? null : n;
    }).filter(n => n !== null) as number[];
    
    if (numbers.length > 0) {
      const converted = numbers.map(n => hasMm ? (n / 10).toFixed(1) : n.toFixed(1));
      res.value = converted.join(' x ') + ' cm';
    }
  }

  // 4. COLOR SYNONYMS
  if (lowerField.includes('colore') || lowerField.includes('finitura')) {
    const cleanV = v.toLowerCase();
    for (const [key, mapped] of Object.entries(COLOR_MAP)) {
      if (cleanV.includes(key)) {
        res.value = mapped;
        break;
      }
    }
  }

  // 5. ALLOWED VALUES VALIDATION (BLOCKING EXPORT)
  if (field.allowedValues && field.allowedValues.length > 0 && res.value !== "") {
    const isValid = field.allowedValues.some(av => res.value.toLowerCase() === av.toLowerCase());
    if (!isValid) {
      res.warnings.push({
        message: `Valore "${res.value}" non conforme allo schema.`,
        severity: 'error',
        action: 'block_export'
      });
    }
  }

  return res;
};

const callGeminiProxy = async (action: string, payload: any) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s Timeout

  try {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || `Errore Server ${response.status}`);
    }
    return await response.json();
  } catch (e: any) {
    if (e.name === 'AbortError') throw new Error("TIMEOUT: L'AI ha impiegato troppo tempo per la ricerca.");
    throw e;
  }
};

export const processProductWithGemini = async (params: any): Promise<any> => {
  const finalValues: Record<string, string> = {};
  const finalAudit: Record<string, SourceInfo> = {};

  // Fase 1: Determinismo Manufacturer/Excel
  params.schema.forEach((field: SchemaField) => {
    let rawVal = params.mappedValues[field.id] || params.manufacturerData?.[field.name];
    if (rawVal) {
      const std = standardizeValue(String(rawVal), field);
      finalValues[field.name] = std.value;
      finalAudit[field.name] = {
        source: 'Dati Certi (Excel)',
        sourceType: 'MANUFACTURER',
        status: 'LOCKED',
        confidence: 'high',
        warnings: std.warnings,
        pipelineVersion: PIPELINE_VERSION
      };
    }
  });

  const missingFields = params.schema.filter((f: SchemaField) => f.enabled && !finalValues[f.name]);
  if (missingFields.length === 0) return { values: finalValues, audit: finalAudit, rawResponse: "Excel Completo" };

  // Fase 2: Chiamata AI con Hardening
  const proxyResult = await callGeminiProxy('process', { ...params, missingFields });
  const aiResult = JSON.parse(cleanJson(proxyResult.data) || '{"values":{},"audit":{}}');

  missingFields.forEach((field: SchemaField) => {
    const aiVal = aiResult.values?.[field.name];
    const aiAudit = aiResult.audit?.[field.name] || {};

    if (aiVal) {
      const std = standardizeValue(String(aiVal), field);
      
      // Determinazione Status STRICT vs ENRICHED
      let status: FieldStatus = 'ENRICHED';
      if (aiAudit.source?.toLowerCase().includes('pdf') || aiAudit.source?.toLowerCase().includes('catalog')) {
        status = 'STRICT';
      }

      finalValues[field.name] = std.value;
      finalAudit[field.name] = {
        source: aiAudit.source || (proxyResult.grounding ? 'Web Search' : 'AI Analysis'),
        sourceType: proxyResult.grounding ? 'WEB' : 'AI',
        status: status,
        confidence: aiAudit.confidence || 'medium',
        url: aiAudit.url || proxyResult.grounding?.groundingChunks?.[0]?.web?.uri,
        warnings: std.warnings,
        pipelineVersion: PIPELINE_VERSION
      };
    } else if (field.fieldClass === 'HARD') {
      // Enforcement HARD: Campo obbligatorio mancante
      finalAudit[field.name] = {
        source: 'Nessuna evidenza trovata',
        sourceType: 'AI',
        status: 'EMPTY',
        confidence: 'low',
        warnings: [{ message: "Campo obbligatorio non trovato.", severity: 'error', action: 'block_export' }],
        pipelineVersion: PIPELINE_VERSION
      };
    }
  });

  return { values: finalValues, audit: finalAudit, rawResponse: proxyResult.data };
};

export const generateFieldExplanation = async (field: SchemaField): Promise<string> => {
  const result = await callGeminiProxy('explain', { fieldName: field.name, description: field.description });
  return result.data;
};

export const generateSchemaFromHeaders = async (headers: string[]): Promise<SchemaField[]> => {
  const result = await callGeminiProxy('generateSchema', { headers });
  const parsed = JSON.parse(cleanJson(result.data));
  return parsed.map((f: any, i: number) => ({
    ...f,
    id: `ai-${Date.now()}-${i}`,
    enabled: true,
    strict: f.fieldClass === 'HARD',
    fillPolicy: f.fieldClass === 'HARD' ? 'REQUIRED_EVIDENCE' : 'ALLOW_INFER',
    allowedValues: [],
    isCustom: true
  }));
};
