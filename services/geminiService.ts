
import { SchemaField, DataSourceType, SourceInfo, Warning, FieldStatus } from '../types';
import { PIPELINE_VERSION } from '../constants';

const cleanJson = (text: string) => {
  const match = text.match(/\{[\s\S]*\}/) || text.match(/\[[\s\S]*\]/);
  if (!match) return text.trim();
  return match[0].replace(/```json/g, '').replace(/```/g, '').trim();
};

interface StandardizedResult {
  value: string;
  warnings: Warning[];
}

/**
 * Normalizzatore (rimane sul client per immediatezza UI)
 */
const standardizeValue = (value: string, fieldName: string, allowedValues: string[] = []): StandardizedResult => {
  let v = value.trim();
  const lowerField = fieldName.toLowerCase();
  const res: StandardizedResult = { value: v, warnings: [] };
  
  if (/^(null|n\/d|n\/a|vuoto|nd|nan|none|-$)$/i.test(v)) return { value: "", warnings: [] };

  if (lowerField.includes('ip')) {
    const cleanIP = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const match = cleanIP.match(/IP\d{2}/);
    if (match) res.value = match[0];
  }

  if (lowerField.includes('altezza') || lowerField.includes('lunghezza') || lowerField.includes('larghezza')) {
    const hasMm = v.toLowerCase().includes('mm');
    let num = parseFloat(v.replace(/mm/gi, '').replace(/cm/gi, '').replace(/\s/g, '').replace(',', '.'));
    if (!isNaN(num)) res.value = (hasMm ? (num / 10).toFixed(1) : num.toFixed(1)) + ' cm';
  }

  return res;
};

const reconcileData = (data: Record<string, string>, audit: Record<string, SourceInfo>) => {
  if (data['CORPO ALTEZZA GENERALE'] && data['CORPO LUNGHEZZA'] && !data['Misure_Generali']) {
    data['Misure_Generali'] = `${data['CORPO LUNGHEZZA']} x ${data['CORPO ALTEZZA GENERALE']}`;
    audit['Misure_Generali'] = {
      source: 'Riconciliazione Backend', sourceType: 'DERIVED', status: 'ENRICHED', confidence: 'high',
      warnings: [{ message: "Generato da campi atomici", severity: 'info' }], pipelineVersion: PIPELINE_VERSION
    };
  }
};

/**
 * BRIDGE VERSO IL PROXY SICURO
 */
const callGeminiProxy = async (action: string, payload: any) => {
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload })
  });
  
  const result = await response.json();
  if (!result.success) throw new Error(result.error);
  return result.data;
};

export const processProductWithGemini = async (params: any): Promise<any> => {
  const finalValues: Record<string, string> = {};
  const finalAudit: Record<string, SourceInfo> = {};

  // STEP 1: MAPPING DETERMINISTICO (già sicuro sul client)
  params.schema.forEach((field: SchemaField) => {
    let rawVal = "";
    let sourceType: DataSourceType = 'MAPPING';
    if (params.mappedValues[field.id]) {
      rawVal = String(params.mappedValues[field.id]);
    } else if (params.manufacturerData?.[field.name]) {
      rawVal = String(params.manufacturerData[field.name]);
      sourceType = 'MANUFACTURER';
    }

    if (rawVal) {
      const std = standardizeValue(rawVal, field.name, field.allowedValues);
      finalValues[field.name] = std.value;
      finalAudit[field.name] = {
        source: sourceType === 'MAPPING' ? 'Mapping Utente' : 'Listino Fornitore',
        sourceType, status: 'LOCKED', confidence: 'high', warnings: std.warnings, pipelineVersion: PIPELINE_VERSION
      };
    }
  });

  const missingFields = params.schema.filter((f: SchemaField) => f.enabled && !finalValues[f.name]);
  if (missingFields.length === 0) return { values: finalValues, audit: finalAudit, rawResponse: "OK" };

  // STEP 2: CHIAMATA AL PROXY SICURO
  const proxyResponse = await callGeminiProxy('process', params);
  const aiResult = JSON.parse(cleanJson(proxyResponse) || '{}');

  missingFields.forEach((field: SchemaField) => {
    let aiVal = aiResult.values?.[field.name] || "";
    let aiAudit = aiResult.audit?.[field.name] || { source: 'Gemini Proxy' };

    if (aiVal) {
      const std = standardizeValue(String(aiVal), field.name, field.allowedValues);
      finalValues[field.name] = std.value;
      finalAudit[field.name] = {
        source: aiAudit.source || "Gemini Proxy",
        sourceType: aiAudit.url ? 'WEB' : 'PDF',
        status: (aiAudit.url ? 'ENRICHED' : 'STRICT') as FieldStatus,
        confidence: aiAudit.confidence || 'medium',
        evidence: aiAudit.evidence,
        url: aiAudit.url,
        warnings: std.warnings,
        pipelineVersion: PIPELINE_VERSION
      };
    }
  });

  reconcileData(finalValues, finalAudit);
  return { values: finalValues, audit: finalAudit, rawResponse: proxyResponse };
};

export const generateFieldExplanation = async (field: SchemaField): Promise<string> => {
  return await callGeminiProxy('explain', { fieldName: field.name, description: field.description });
};

export const generateSchemaFromHeaders = async (headers: string[]): Promise<SchemaField[]> => {
  const responseText = await callGeminiProxy('generateSchema', { headers });
  const parsed = JSON.parse(cleanJson(responseText) || "[]");
  
  return parsed.map((item: any, idx: number) => ({
    id: `ai-${idx}-${Date.now()}`,
    name: item.name,
    description: item.description,
    prompt: item.prompt || `Estrai ${item.name}`,
    enabled: true,
    strict: item.fieldClass === 'HARD',
    fieldClass: item.fieldClass || 'HARD',
    fillPolicy: item.fillPolicy || 'REQUIRED_EVIDENCE',
    allowedValues: [],
    isCustom: false
  }));
};

export const urlToGenerativePart = async (url: string) => {
  // Nota: Questo rimane nel frontend per gestire il fetch dall'ambiente utente
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    const reader = new FileReader();
    const base64 = await new Promise<string>((resolve) => {
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(blob);
    });
    return { inlineData: { data: base64, mimeType: blob.type } };
  } catch (e) { return null; }
};
