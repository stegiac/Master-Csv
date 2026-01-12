
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

// Middleware per assicurare che le API rispondano sempre in JSON
app.use('/api', (req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

// Diagnostic Route
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'online', 
    apiKeyConfigured: !!process.env.API_KEY,
    timestamp: new Date().toISOString()
  });
});

app.post('/api/gemini', async (req, res) => {
  const { action, payload } = req.body;
  const requestId = Math.random().toString(36).substring(7);

  console.log(`[${requestId}] AZIONE: ${action}`);

  if (!process.env.API_KEY) {
    return res.status(401).json({ success: false, error: "API_KEY mancante nelle variabili d'ambiente di Hostinger." });
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    if (action === 'process') {
      const { sku, ean, missingFields, pdfContextData, brandName } = payload;
      
      const systemInstruction = `Sei l'Analista AI Master per E-Commerce Industriale. 
      Brand obiettivo: ${brandName || 'Sconosciuto'}.
      COMPITO: Estrai dati tecnici certi per lo SKU fornito.
      
      REGOLE:
      1. PRIORITÀ: Usa il "CONTESTO PDF" fornito.
      2. NO HALLUCINATION: Se non trovi il dato, rispondi "".
      3. OUTPUT: SOLO JSON.`;

      const prompt = `ESTRAI DATI PER SKU: ${sku} (EAN: ${ean}).
      Campi: ${missingFields.map(f => f.name).join(', ')}.
      CONTESTO PDF: ${pdfContextData?.rawText?.substring(0, 10000) || 'Nessun PDF.'}`;

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: { parts: [{ text: prompt }] },
        config: { 
          systemInstruction,
          tools: [{ googleSearch: {} }]
        }
      });

      return res.json({ success: true, data: response.text });
    }

    if (action === 'explain' || action === 'generateSchema') {
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: action === 'explain' 
          ? `Spiega campo e-commerce "${payload.fieldName}": ${payload.description}`
          : `Crea schema JSON da header: ${payload.headers.join(', ')}`,
        config: { responseMimeType: "application/json" }
      });
      return res.json({ success: true, data: response.text });
    }

    res.status(400).json({ error: "Azione non valida" });
  } catch (error) {
    console.error(`[${requestId}] ERRORE:`, error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Fallback per rotte API inesistenti (evita di servire index.html)
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `Rotta API ${req.url} non trovata.` });
});

// Serving static files
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, () => {
  console.log(`🚀 Master AI Server attivo sulla porta ${PORT}`);
});
