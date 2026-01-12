
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
 * Normalizzatore Industriale Avanzato
 */
const standardizeValue = (value: string, fieldName: string, allowedValues: string[] = []): StandardizedResult => {
  let v = value.trim();
  const lowerField = fieldName.toLowerCase();
  const res: StandardizedResult = { value: v, warnings: [] };
  
  if (/^(null|n\/d|n\/a|vuoto|nd|nan|none|-$)$/i.test(v)) {
    return { value: "", warnings: [] };
  }

  // 1. IP Standardizer
  if (lowerField.includes('ip')) {
    const cleanIP = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const match = cleanIP.match(/IP\d{2}/);
    if (match) {
      res.value = match[0];
    } else if (cleanIP.length === 2 && !isNaN(parseInt(cleanIP))) {
      res.value = `IP${cleanIP}`;
      res.warnings.push({ message: "Prefisso IP aggiunto automaticamente", severity: 'info', action: 'none' });
    } else {
      res.warnings.push({ message: `Formato IP non valido: ${v}`, severity: 'error', action: 'review' });
    }
  }

  // 2. Color Mapping
  const colorMap: Record<string, string> = {
    'antracite': 'Grigio Scuro',
    'anthracite': 'Grigio Scuro',
    'titanio': 'Grigio Titanio',
    'nickel': 'Nichel',
    'chrome': 'Cromo',
    'ottone': 'Oro/Ottone'
  };
  if (lowerField.includes('colore') || lowerField.includes('finitura')) {
    const mapped = colorMap[v.toLowerCase()];
    if (mapped) {
      res.value = mapped;
      res.warnings.push({ message: `Colore normalizzato: ${v} -> ${mapped}`, severity: 'info', action: 'none' });
    }
  }

  // 3. Energy Label
  if (lowerField.includes('energetica')) {
    if (v.includes('+')) {
      res.warnings.push({ message: "Rilevata vecchia scala energetica (A+). Verificare conformità nuova scala A-G.", severity: 'warn', action: 'review' });
      const baseClass = v.match(/[A-G]/i);
      if (baseClass) res.value = baseClass[0].toUpperCase();
    }
    if (allowedValues.length > 0 && res.value) {
      const isAllowed = allowedValues.map(a => a.toUpperCase()).includes(res.value.toUpperCase());
      if (!isAllowed) {
        res.warnings.push({ message: `Classe ${res.value} non permessa nello schema di destinazione`, severity: 'error', action: 'block_export' });
      }
    }
  }

  // 4. Dimensioni (Robust Parsing)
  if (lowerField.includes('altezza') || lowerField.includes('lunghezza') || lowerField.includes('larghezza') || lowerField.includes('misure') || lowerField.includes('profondità')) {
    const hasMm = v.toLowerCase().includes('mm');
    // Pulizia annotazioni e simboli diametro
    let cleanV = v.replace(/mm/gi, '').replace(/cm/gi, '').replace(/\(L\)/gi, '').replace(/\(H\)/gi, '').replace(/\(P\)/gi, '').replace(/Ø/g, '').replace(/\s/g, '').replace(',', '.');
    
    // Supporto separatori esteso: x, *, ×, ;, /
    if (cleanV.split(/[x*×;/]/i).length > 1) {
      const parts = cleanV.split(/[x*×;/]/i);
      const converted = parts.map(p => {
        let n = parseFloat(p);
        if (isNaN(n)) return p;
        return hasMm ? (n / 10).toFixed(1) : n.toFixed(1);
      });
      res.value = converted.join(' x ') + ' cm';
    } else {
      let num = parseFloat(cleanV);
      if (!isNaN(num)) res.value = (hasMm ? (num / 10).toFixed(1) : num.toFixed(1)) + ' cm';
    }
  }

  return res;
};

/**
 * Riconciliazione Bidirezionale con Conflict Detection
 */
const reconcileData = (data: Record<string, string>, audit: Record<string, SourceInfo>) => {
  const hKey = 'CORPO ALTEZZA GENERALE';
  const lKey = 'CORPO LUNGHEZZA';
  const sumKey = 'Misure_Generali';

  // 1. Detection Conflitti
  if (data[hKey] && data[lKey] && data[sumKey]) {
    const sumParts = data[sumKey].split('x').map(p => parseFloat(p.replace(/[^\d.]/g, '')));
    const hVal = parseFloat(data[hKey].replace(/[^\d.]/g, ''));
    const lVal = parseFloat(data[lKey].replace(/[^\d.]/g, ''));

    if (sumParts.length >= 2) {
      const diffL = Math.abs(sumParts[0] - lVal);
      const diffH = Math.abs(sumParts[1] - hVal);
      if (diffL > 0.5 || diffH > 0.5) {
        const msg = `CONFLITTO MISURE: Riepilogo (${data[sumKey]}) vs Atomici (${data[lKey]}x${data[hKey]})`;
        audit[sumKey].warnings.push({ message: msg, severity: 'error', action: 'block_export' });
      }
    }
  }

  // 2. Dagli atomici al riepilogo
  if (data[hKey] && data[lKey] && !data[sumKey]) {
    data[sumKey] = `${data[lKey]} x ${data[hKey]}`;
    audit[sumKey] = {
      source: 'Motore di Riconciliazione', sourceType: 'DERIVED', status: 'ENRICHED', confidence: 'high',
      warnings: [{ message: "Generato da campi atomici", severity: 'info' }], pipelineVersion: PIPELINE_VERSION
    };
  }

  // 3. Dal riepilogo agli atomici (Inverse)
  if (data[sumKey] && (!data[hKey] || !data[lKey])) {
    const parts = data[sumKey].split('x').map(p => p.trim());
    if (parts.length >= 2) {
      if (!data[lKey]) {
        data[lKey] = parts[0];
        audit[lKey] = { source: 'Riconciliazione (da Riepilogo)', sourceType: 'DERIVED', status: 'ENRICHED', confidence: 'medium', warnings: [], pipelineVersion: PIPELINE_VERSION };
      }
      if (!data[hKey]) {
        data[hKey] = parts[1];
        audit[hKey] = { source: 'Riconciliazione (da Riepilogo)', sourceType: 'DERIVED', status: 'ENRICHED', confidence: 'medium', warnings: [], pipelineVersion: PIPELINE_VERSION };
      }
    }
  }
};

const callGeminiProxy = async (action: string, payload: any) => {
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload })
  });
  
  const result = await response.json();
  if (!result.success) throw new Error(result.error);
  return result;
};

export const processProductWithGemini = async (params: any): Promise<any> => {
  const finalValues: Record<string, string> = {};
  const finalAudit: Record<string, SourceInfo> = {};

  // FASE 1: DETERMINISMO (Client-Side)
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
  if (missingFields.length === 0) return { values: finalValues, audit: finalAudit, rawResponse: "OK (Deterministico)" };

  // FASE 2: AI PROXY (Solo campi mancanti)
  const proxyResult = await callGeminiProxy('process', { ...params, missingFields });
  const aiResult = JSON.parse(cleanJson(proxyResult.data) || '{}');

  missingFields.forEach((field: SchemaField) => {
    let aiVal = aiResult.values?.[field.name] || "";
    let aiAudit = aiResult.audit?.[field.name] || { source: 'Gemini Proxy' };

    if (aiVal) {
      const std = standardizeValue(String(aiVal), field.name, field.allowedValues);
      
      const determinedSource: DataSourceType = aiAudit.url ? 'WEB' : (aiAudit.evidence ? 'PDF' : 'AI');
      const determinedStatus: FieldStatus = (determinedSource === 'PDF' && field.fieldClass === 'HARD') ? 'STRICT' : 'ENRICHED';

      finalValues[field.name] = std.value;
      finalAudit[field.name] = {
        source: `${aiAudit.source || "Gemini Proxy"} (${proxyResult.modelUsed})`,
        sourceType: determinedSource,
        status: determinedStatus,
        confidence: aiAudit.confidence || 'medium',
        evidence: aiAudit.evidence,
        url: aiAudit.url,
        warnings: std.warnings,
        pipelineVersion: PIPELINE_VERSION
      };
    }
  });

  reconcileData(finalValues, finalAudit);
  return { values: finalValues, audit: finalAudit, rawResponse: proxyResult.data };
};

export const generateFieldExplanation = async (field: SchemaField): Promise<string> => {
  const result = await callGeminiProxy('explain', { fieldName: field.name, description: field.description });
  return result.data;
};

export const generateSchemaFromHeaders = async (headers: string[]): Promise<SchemaField[]> => {
  const result = await callGeminiProxy('generateSchema', { headers });
  const parsed = JSON.parse(cleanJson(result.data) || "[]");
  
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
