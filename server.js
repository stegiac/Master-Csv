
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '50mb' })); // Supporto per dati PDF/Immagini pesanti

const PORT = process.env.PORT || 3000;

// Inizializzazione sicura dell'AI sul Server
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const cleanJson = (text) => {
  const match = text.match(/\{[\s\S]*\}/) || text.match(/\[[\s\S]*\]/);
  if (!match) return text.trim();
  return match[0].replace(/```json/g, '').replace(/```/g, '').trim();
};

/**
 * Endpoint Proxy per Gemini
 * Protegge la API_KEY e gestisce la logica di business lato server
 */
app.post('/api/gemini', async (req, res) => {
  const { action, payload } = req.body;

  try {
    if (action === 'process') {
      const { sku, ean, schema, pdfContextData, mappedValues, brandName } = payload;
      
      const missingFields = schema.filter(f => f.enabled && !mappedValues[f.id]);
      const systemInstruction = `Sei un Analista E-commerce. Campi HARD: richiedono evidenza. Campi SOFT: inferenza permessa. Brand: ${brandName}. Ritorna JSON {values: {}, audit: {field: {source, confidence, evidence, url}}}.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts: [{ text: `Processa SKU: ${sku}. EAN: ${ean}. Context: ${pdfContextData?.rawText || ''}` }] },
        config: { systemInstruction, tools: [{ googleSearch: {} }], responseMimeType: "application/json" }
      });
      
      return res.json({ success: true, data: response.text });
    }

    if (action === 'explain') {
      const { fieldName, description } = payload;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Spiega brevemente il campo e-commerce "${fieldName}" (${description}). Rispondi in una frase breve in italiano.`,
      });
      return res.json({ success: true, data: response.text });
    }

    if (action === 'generateSchema') {
      const { headers } = payload;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analizza queste intestazioni Excel e crea uno schema e-commerce: ${headers.join(', ')}`,
        config: { responseMimeType: "application/json" }
      });
      return res.json({ success: true, data: response.text });
    }

    res.status(400).json({ error: "Azione non riconosciuta" });
  } catch (error) {
    console.error("Gemini Proxy Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Serve i file statici dalla cartella 'dist'
app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Pipeline Industriale Sicura avviata sulla porta ${PORT}`);
});
