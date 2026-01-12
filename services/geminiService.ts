
import { GoogleGenAI } from "@google/genai";
import { SchemaField, DataSourceType, PdfExtractedData } from '../types';

// Helper to convert file to base64
export const fileToGenerativePart = async (file: File) => {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });
  return {
    inlineData: {
      data: await base64EncodedDataPromise,
      mimeType: file.type,
    },
  };
};

// Helper to fetch image URL and convert to base64
export const urlToGenerativePart = async (url: string) => {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const base64EncodedDataPromise = new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(blob);
    });
    return {
      inlineData: {
        data: await base64EncodedDataPromise,
        mimeType: blob.type || "image/jpeg",
      },
    };
  } catch (error) {
    console.warn("Failed to fetch image from URL (CORS likely):", url);
    return null;
  }
};

interface ProcessItemParams {
  sku: string;
  ean: string;
  manufacturerData: any | null;
  manufacturerDescription?: string; // Text description extracted from manu file
  pdfContextData?: PdfExtractedData; 
  schema: SchemaField[];
  trustedDomains: string[];
  dataPriority: DataSourceType[];
  brandName: string;
  imageBase64Part: any | null;
  pdfPageImage?: string | null; // Image of the PDF page
  mappedValues: Record<string, any>; // Mapped values directly from manufacturer file
}

interface ProcessResult {
  data: Record<string, string>;
  sourceMap: Record<string, string>;
  sources: string[]; // External URLs
  rawResponse: string; // Full AI response
}

// Function to wait for a specified time
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- OPTIMIZED BATCH PDF ANALYSIS (TEXT CHUNKING) ---
export const batchAnalyzePdf = async (
  relevantContext: string,
  skus: string[], 
  brandName: string
): Promise<Record<string, PdfExtractedData>> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");

  if (!relevantContext || relevantContext.length < 10) {
    return {};
  }

  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `
    Sei un analista tecnico esperto.
    
    OBIETTIVO:
    Analizza i seguenti FRAMMENTI DI TESTO estratti da cataloghi PDF.
    Cerca SPECIFICATAMENTE le specifiche tecniche per i seguenti SKU: ${skus.join(', ')}.
    Brand target: ${brandName}.
    
    IMPORTANTE:
    Il testo fornito è frammentato (Chunking). Potresti trovare lo stesso SKU su più pagine. Unisci le informazioni.
    
    PER OGNI SKU TROVATO, ESTRAI:
    1. "data": Tutte le specifiche tecniche (Dimensioni, Watt, Lumen, IP, Colore descritto, Materiali).
    2. "visuals": Se il testo descrive l'aspetto (es. "finitura nera", "tondo"), estrailo.
    3. "sourcePage": Il riferimento alla fonte (es. "Pagina 12").

    FORMATO OUTPUT JSON:
    Restituisci una mappa con chiave SKU:
    {
      "SKU_1": {
        "data": { "WATT": "10W", "IP": "20" },
        "visuals": { "COLORE": "Nero", "FORMA": "Tonda" },
        "sourcePage": "Pag. 12"
      }
    }
    Solo JSON valido.
  `;

  const parts = [{ text: `TESTO ESTRATTO DAI CATALOGHI:\n\n${relevantContext}` }];
  
  for(let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts },
        config: { systemInstruction }
      });

      let text = response.text || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        text = jsonMatch[0];
        text = text.replace(/```json/g, '').replace(/```/g, '');
        return JSON.parse(text);
      }
      return {};
    } catch (e: any) {
      if (e.message && e.message.includes('429')) {
         await delay(4000);
         continue;
      }
      console.error("Batch Analysis Error:", e);
      return {};
    }
  }
  return {};
};


export const processProductWithGemini = async (params: ProcessItemParams): Promise<ProcessResult> => {
  const { sku, ean, manufacturerData, manufacturerDescription, pdfContextData, schema, trustedDomains, dataPriority, brandName, imageBase64Part, pdfPageImage, mappedValues } = params;

  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");

  const ai = new GoogleGenAI({ apiKey });
  
  const schemaDescription: Record<string, any> = {};

  schema.filter(f => f.enabled).forEach(field => {
    let description = field.prompt;
    if (field.strict) {
      description += " [MODALITÀ RIGOROSA: ESTRAI SOLO IL DATO ESATTO (Raw Data). Se non lo trovi nei documenti, restituisci stringa vuota. NON INVENTARE.]";
    } else {
      description += " [MODALITÀ CREATIVA/DISCORSIVA: Genera un testo fluido e descrittivo. ATTENZIONE: Basati SOLO sui dati reali. NON INVENTARE funzioni o valori non presenti.]";
    }
    
    if (mappedValues[field.name]) {
       description += ` [IMPORTANTE: Per questo campo DEVI USARE il valore mappato: "${mappedValues[field.name]}"]`;
    }

    schemaDescription[field.name] = {
      description: description,
      allowedValues: field.allowedValues && field.allowedValues.length > 0 ? field.allowedValues : "Qualsiasi"
    };
  });

  const trustedListString = trustedDomains.length > 0 ? trustedDomains.join(', ') : 'Nessuno specifico';
  const brandString = brandName ? `BRAND/PRODUTTORE: ${brandName}` : '';

  const priorityMap: Record<DataSourceType, string> = {
    'MAPPING': 'MAPPATURA DIRETTA (Valori forniti)',
    'MANUFACTURER': 'Dati Produttore JSON',
    'PDF': 'CATALOGHI PDF (ANALISI VISIVA + TESTUALE)',
    'WEB': 'Ricerca Web (Google)',
    'IMAGE': 'Analisi Visiva Foto (File Base)'
  };

  const priorityInstruction = dataPriority.map((type, idx) => `${idx + 1}. ${priorityMap[type]}`).join('\n    ');

  const systemInstruction = `
    Sei un esperto Data Analyst e Gestore E-commerce Tecnico.
    
    OBIETTIVO: Compilare una scheda prodotto perfetta e completa.
    
    REGOLE DI PRIORITÀ DATI (Segui rigorosamente questo ordine):
    ${priorityInstruction}

    DATI SICURI (ANCHOR POINTS):
    Usa sempre SKU, EAN e BRAND forniti come "Verità Assoluta".

    --- STRATEGIA AVANZATA DI RICERCA E AFFIDABILITÀ WEB ---
    DOMINI AFFIDABILI (White List): ${trustedListString}

    Regole per la ricerca Google:
    1. Cerca attivamente "Scheda tecnica [EAN]", "[SKU] [Brand] specs", "site:[DominiAffidabili] [SKU]".
    2. CROSS-CHECK: Se trovi un dato sul web generico, cerca conferma sui domini affidabili o nel PDF.

    CLASSIFICAZIONE FONTI (Obbligatorio nel JSON 'sources'):
    - Se il dato viene dai DOMINI AFFIDABILI -> Fonte: "Web: [NomeDominio]" (es. "Web: amazon.it").
    - Se il dato viene dal WEB GENERICO -> Fonte: "Web: [NomeDominio] (⚠️ Non Verificato)" (es. "Web: blog-luci.com (⚠️ Non Verificato)").
    - Se il dato viene dal PDF -> Fonte: "PDF (Pag [X])".
    - Se il dato viene dal Produttore -> Fonte: "File Produttore".

    --- ISTRUZIONI CRITICHE PDF E IMMAGINI CATALOGO (STRATEGIA "DATA HUNTER") ---
    Se ricevi l'immagine di una pagina PDF ("PDF Page Image"), usala per decodificare i dati che il testo grezzo perde.
    
    1. **ANALISI TABELLARE VISIVA:** Individua la riga SKU ${sku}. Associa colonne (es. "Kg" -> Peso).
    2. **RECUPERO CAMPI DIFFICILI:** Peso, Imballo, Classe Energetica (A++, E, F), IP.
    
    REGOLA DEL CONFLITTO (IMPORTANTE):
    Se trovi dati contrastanti tra Web Generico e Domini Affidabili/PDF, SCARTA il Web Generico.
    
    FORMATO OUTPUT OBBLIGATORIO:
    Oggetto JSON con DUE chiavi principali:
    1. "values": Oggetto piatto {"NomeCampo": "Valore"}.
    2. "sources": Oggetto piatto {"NomeCampo": "Fonte"} (vedi regole classificazione sopra).
    
    IMPORTANTE - SINTASSI:
    - SOLO JSON PURO.
    - Se un dato non viene trovato, usa stringa vuota "" (NON usare "NULL", "N/D").
    
    SCHEMA:
    ${JSON.stringify(schemaDescription, null, 2)}
    
    INPUT:
    - ${brandString}
    - SKU (Safe): ${sku}
    - EAN (Safe): ${ean}
    - Dati Produttore (Safe): ${manufacturerData ? JSON.stringify(manufacturerData) : 'Nessuno'}
    - Descrizione Produttore: ${manufacturerDescription ? manufacturerDescription : 'Nessuno'}
    - Mappatura Forzata (Safe): ${JSON.stringify(mappedValues)}
    - Dati Estratti da PDF (Testo): ${pdfContextData ? JSON.stringify(pdfContextData) : 'Nessun dato testuale strutturato.'}
    ${(pdfContextData as any)?.rawTextOverride ? `- TESTO GREZZO PAGINA PDF (BACKUP): ${(pdfContextData as any).rawTextOverride}` : ''}
  `;

  const parts: any[] = [];
  
  // Add Image from PDF Page FIRST (High Priority Context)
  if (pdfPageImage) {
    parts.push({
        inlineData: {
          data: pdfPageImage,
          mimeType: "image/jpeg"
        }
    });
    parts.push({ text: `[IMMAGINE PAGINA CATALOGO PDF]: Questa immagine ad ALTA RISOLUZIONE contiene la tabella tecnica per lo SKU ${sku}. Fai attenzione alle colonne Peso (kg), Imballo, IP e Classe Energetica.` });
  }

  // Add Image from Base File
  if (imageBase64Part) {
    parts.push(imageBase64Part);
    parts.push({ text: `[FOTO PRODOTTO]: Usa questa solo per forma, colore e finitura.` });
  }

  let promptText = `Analizza il prodotto. DATI SICURI DI PARTENZA -> SKU: ${sku}, EAN: ${ean}, BRAND: ${brandName || 'Sconosciuto'}.`;
  
  if (manufacturerDescription) {
    promptText += ` Analizza la descrizione testuale fornita dal produttore.`;
  }

  if (pdfContextData) {
    promptText += ` Ho trovato riferimenti nel PDF (vedi JSON input).`;
  }
  
  if ((pdfContextData as any)?.rawTextOverride) {
      promptText += ` ATTENZIONE: Usa il testo grezzo PDF per trovare la riga corretta, ma LEGGI I VALORI DALL'IMMAGINE per capire le colonne.`;
  }

  promptText += ` Cerca sul WEB (priorità: ${trustedListString}) per completare i dati mancanti. Se usi fonti non affidabili, segnalalo nel campo sources.`;

  parts.push({ text: promptText });

  // --- RETRY LOGIC ---
  const maxRetries = 3;
  let attempt = 0;
  
  while (attempt <= maxRetries) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: parts },
        config: {
          systemInstruction: systemInstruction,
          tools: [{ googleSearch: {} }],
        }
      });

      const originalText = response.text || "";
      let text = originalText;
      
      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const webSources: string[] = groundingChunks
        .map((c: any) => c.web?.uri || c.web?.title)
        .filter((s: any) => s && typeof s === 'string');

      if (!text) return { data: {}, sourceMap: {}, sources: [], rawResponse: "Nessuna risposta dall'AI" };
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        text = jsonMatch[0];
      } else {
        if (attempt === maxRetries) return { data: {}, sourceMap: {}, sources: [], rawResponse: originalText };
        throw new Error("Risposta AI non valida (Nessun oggetto JSON trovato)");
      }

      text = text.replace(/```json/g, '').replace(/```/g, '').replace(/,(\s*[}\]])/g, '$1');

      let parsedJson: any = {};
      try {
        parsedJson = JSON.parse(text);
      } catch (e: any) {
        throw new Error(`Errore Parsing JSON: ${e.message}`);
      }

      let valuesData = parsedJson.values || parsedJson; 
      let sourcesData = parsedJson.sources || {};

      if (!parsedJson.values && !parsedJson.sources) {
        sourcesData = {}; 
        for(const key in valuesData) {
          sourcesData[key] = "AI/Auto"; 
        }
      }

      const sanitizedValues: Record<string, string> = {};
      const sanitizedSources: Record<string, string> = {};
      
      for (const key in valuesData) {
        let value = valuesData[key];
        
        // Extract value if object
        if (typeof value === 'object' && value !== null) {
           value = 'value' in value ? String(value.value) : JSON.stringify(value);
        } else {
           value = String(value);
        }

        // STRICT SANITIZATION: Remove 'null', 'NULL', 'N/D', 'N/A'
        const lowerVal = value.trim().toLowerCase();
        if (lowerVal === 'null' || lowerVal === 'n/d' || lowerVal === 'n/a' || lowerVal === 'undefined' || lowerVal === 'nessuno' || lowerVal === 'unknown') {
            value = "";
        }

        sanitizedValues[key] = value;
      }

      for (const key in sourcesData) {
        sanitizedSources[key] = String(sourcesData[key]);
      }

      return { 
        data: sanitizedValues, 
        sourceMap: sanitizedSources,
        sources: Array.from(new Set(webSources)),
        rawResponse: originalText
      };

    } catch (error: any) {
      if (error.message && error.message.includes('429')) {
        attempt++;
        if (attempt <= maxRetries) {
          const waitTime = 2000 * Math.pow(2, attempt);
          console.warn(`Hit Rate Limit (429). Retrying in ${waitTime}ms...`);
          await delay(waitTime);
          continue;
        }
      }
      
      console.error("Gemini API Error:", error);
      throw error;
    }
  }
  throw new Error("Failed to process after multiple retries.");
};

export const generateFieldExplanation = async (field: SchemaField): Promise<string> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");

  const ai = new GoogleGenAI({ apiKey });
  
  const systemInstruction = "Sei un UX Writer esperto. Il tuo compito è scrivere spiegazioni brevi (max 25 parole), chiare e utili per gli utenti di un software di importazione e-commerce. Spiega a cosa serve il campo dati fornito con tono professionale.";

  const prompt = `
    Analizza il seguente campo dello schema di importazione:
    
    NOME: ${field.name}
    DESCRIZIONE TECNICA: ${field.description}
    ISTRUZIONI AI (PROMPT): ${field.prompt}
    TIPO: ${field.strict ? 'Dato Tecnico Rigoroso' : 'Contenuto Creativo/Generativo'}
    VALORI AMMESSI: ${field.allowedValues && field.allowedValues.length > 0 ? field.allowedValues.join(', ') : 'Libero'}

    Genera una spiegazione user-friendly che aiuti l'utente a capire cosa aspettarsi in questo campo.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [{ text: prompt }] },
      config: { systemInstruction }
    });

    return response.text.trim();
  } catch (error) {
    console.error("Error generating explanation:", error);
    return "";
  }
};

export const generateSchemaFromHeaders = async (headers: string[]): Promise<SchemaField[]> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");

  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `
    Sei un esperto di configurazione E-commerce (PrestaShop, WooCommerce, Shopify, Magento).
    
    OBIETTIVO:
    Riceverai una lista di intestazioni di colonna (Headers) provenienti da un file di importazione.
    Per ogni intestazione, devi generare un oggetto JSON che configuri come l'AI deve estrarre quel dato.

    PARAMETRI PER OGNI CAMPO:
    - id: genera un ID univoco stringa.
    - name: Il nome esatto dell'intestazione (non cambiarlo).
    - description: Una breve descrizione di cosa contiene (es. "Peso in kg", "Descrizione HTML").
    - prompt: Un'istruzione chiara per l'AI che dovrà estrarre il dato (es. "Estrai il peso netto numerico. Se non lo trovi, lascia vuoto.").
    - strict: true se è un dato tecnico (Dimensioni, EAN, Codici, Numeri), false se è creativo (Titoli, Descrizioni).
    - allowedValues: array di stringhe se il campo accetta solo valori specifici (es. "SI", "NO" o "Pubblicato", "Bozza"), altrimenti array vuoto.

    FORMATO OUTPUT:
    Restituisci ESCLUSIVAMENTE un array JSON di oggetti SchemaField.
    
    Esempio Input: ["product_name", "weight_kg", "active"]
    Esempio Output:
    [
      { "id": "1", "name": "product_name", "description": "Nome del prodotto", "prompt": "Genera un titolo prodotto ottimizzato", "strict": false, "allowedValues": [] },
      { "id": "2", "name": "weight_kg", "description": "Peso in Kg", "prompt": "Estrai solo il valore numerico del peso", "strict": true, "allowedValues": [] },
      { "id": "3", "name": "active", "description": "Stato pubblicazione", "prompt": "1 per attivo, 0 per inattivo", "strict": true, "allowedValues": ["1", "0"] }
    ]
  `;

  const prompt = `Analizza queste intestazioni di colonne e crea lo schema: ${JSON.stringify(headers)}`;

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [{ text: prompt }] },
        config: { systemInstruction }
    });

    let text = response.text || "";
    // Cleanup JSON markdown
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
        text = jsonMatch[0];
    }
    text = text.replace(/```json/g, '').replace(/```/g, '');

    const fields = JSON.parse(text);
    // Ensure "enabled" and "isCustom" are set correctly
    return fields.map((f: any, idx: number) => ({
        ...f,
        id: Date.now().toString() + idx,
        enabled: true,
        isCustom: true,
        aiExplanation: f.description // Default explanation
    }));

  } catch (error) {
    console.error("Error generating schema from headers:", error);
    return [];
  }
};
