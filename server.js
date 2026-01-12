
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '50mb' }));

const PORT = process.env.PORT || 3000;
const MODEL_NAME = 'gemini-3-pro-preview';

app.post('/api/gemini', async (req, res) => {
  const { action, payload } = req.body;
  const requestId = Math.random().toString(36).substring(7);

  console.log(`[${requestId}] AZIONE: ${action}`);

  if (!process.env.API_KEY) {
    return res.status(401).json({ success: false, error: "API_KEY non configurata." });
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    if (action === 'process') {
      const { sku, ean, missingFields, pdfContextData, brandName } = payload;
      
      const systemInstruction = `Sei l'Analista AI Master per E-Commerce Industriale. 
      Brand obiettivo: ${brandName || 'Sconosciuto'}.
      
      COMPITO: Estrai dati tecnici certi per lo SKU fornito.
      
      REGOLE DI HARDENING (MANDATORIE):
      1. PRIORITÀ: Se fornito, usa il "CONTESTO PDF" come fonte assoluta.
      2. HALLUCINATION PROTECTION: Se non trovi il dato né nel PDF né via Web Search, lascia il campo vuoto "". NON INVENTARE.
      3. OUTPUT: Rispondi SOLO in JSON puro, senza commenti o markdown esterni.
      4. SOURCE: Nel campo "source" del JSON, specifica se hai usato "PDF Catalog", "Official Website" o "Web Aggregator".
      
      JSON SCHEMA:
      {
        "values": { "NomeCampo": "Valore" },
        "audit": { "NomeCampo": { "source": "descrizione", "confidence": "high|medium|low", "url": "URL se WEB" } }
      }`;

      const prompt = `ESTRAI DATI PER SKU: ${sku} (EAN: ${ean}).
      Campi richiesti: ${missingFields.map(f => f.name).join(', ')}.
      
      CONTESTO PDF: ${pdfContextData?.rawText?.substring(0, 10000) || 'Nessun PDF caricato.'}
      
      Se il PDF non basta, usa Google Search per cercare la scheda tecnica ufficiale di "${brandName} ${sku}".`;

      console.log(`[${requestId}] Interrogazione Gemini Pro...`);

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: { parts: [{ text: prompt }] },
        config: { 
          systemInstruction,
          tools: [{ googleSearch: {} }] // Ricerca web abilitata solo per process
        }
      });

      console.log(`[${requestId}] Risposta ricevuta correttamente.`);
      return res.json({ 
        success: true, 
        data: response.text, 
        grounding: response.candidates?.[0]?.groundingMetadata
      });
    }

    if (action === 'explain' || action === 'generateSchema') {
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: action === 'explain' 
          ? `Spiega in modo tecnico ma comprensibile il campo e-commerce "${payload.fieldName}": ${payload.description}`
          : `Analizza questi header Excel e crea uno schema JSON di campi (name, description, fieldClass: HARD|SOFT): ${payload.headers.join(', ')}`,
        config: { responseMimeType: "application/json" }
      });
      return res.json({ success: true, data: response.text });
    }

    res.status(400).json({ error: "Azione non riconosciuta" });
  } catch (error) {
    console.error(`[${requestId}] ERRORE:`, error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serving static files (Configurazione per Deploy Hostinger/Node)
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, () => {
  console.log(`🚀 Master AI Server attivo sulla porta ${PORT}`);
});
