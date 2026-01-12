
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '50mb' }));

const PORT = process.env.PORT || 3000;

// HEALTH CHECK - Spostato in alto per massima priorità
app.get('/api/health', (req, res) => {
  // Fixed: Always use process.env.API_KEY exclusively
  const key = process.env.API_KEY;
  res.setHeader('Content-Type', 'application/json');
  res.json({ 
    status: 'online', 
    apiKeyConfigured: !!key,
    timestamp: new Date().toISOString()
  });
});

app.post('/api/gemini', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const { action, payload } = req.body;
  
  // Fixed: Ensure API key is present exclusively from process.env.API_KEY
  if (!process.env.API_KEY) {
    return res.status(401).json({ success: false, error: "API_KEY non configurata." });
  }

  try {
    // Fixed: Initialize GoogleGenAI right before use with direct env access
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    if (action === 'process') {
      const { sku, ean, missingFields, pdfContextData, brandName } = payload;
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Analizza SKU ${sku} (${brandName}). Campi: ${missingFields.map(f => f.name).join(',')}. Contesto: ${pdfContextData?.rawText?.substring(0, 8000)}`,
        config: {
          systemInstruction: "Sei un analista tecnico e-commerce. Estrai solo dati certi. Rispondi in JSON.",
          tools: [{ googleSearch: {} }]
        }
      });
      // Fixed: Access .text as a property, not a method
      return res.json({ success: true, data: response.text });
    }

    // Fixed: Implemented 'explain' action required by the frontend
    if (action === 'explain') {
      const { fieldName, description } = payload;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Spiega il significato del campo e-commerce "${fieldName}" (${description}) a un utente finale in una frase semplice.`,
      });
      return res.json({ success: true, data: response.text });
    }

    // Fixed: Implemented 'generateSchema' action required by the frontend
    if (action === 'generateSchema') {
      const { headers } = payload;
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Analizza queste intestazioni Excel: ${headers.join(', ')}. Genera uno schema JSON di mappatura.`,
        config: {
          systemInstruction: "Genera un array JSON di oggetti con {name, description, prompt, fieldClass}. fieldClass deve essere 'HARD' per dati tecnici esatti o 'SOFT' per campi descrittivi.",
          responseMimeType: "application/json"
        }
      });
      return res.json({ success: true, data: response.text });
    }
    
    res.status(400).json({ error: "Azione non valida" });
  } catch (error) {
    console.error("API ERROR:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// STATIC FILES
app.use(express.static(path.join(__dirname, 'dist')));

// SPA FALLBACK
app.get('*', (req, res) => {
  // Se la richiesta inizia con /api ma non è stata gestita, restituisci 404 JSON, non HTML
  if (req.url.startsWith('/api')) {
    res.status(404).json({ error: `Rotta API ${req.url} non trovata.` });
  } else {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server attivo su porta ${PORT}`);
});
