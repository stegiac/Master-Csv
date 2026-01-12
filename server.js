
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Trust proxy è fondamentale su Hostinger/Heroku/Vercel
app.set('trust proxy', 1);

app.use(express.json({ limit: '50mb' }));

const PORT = process.env.PORT || 3000;
const MODEL_NAME = 'gemini-2.0-flash-exp'; // Usiamo un modello stabile e veloce per test

// Middleware per logging richieste
app.use((req, res, next) => {
  if (req.url.startsWith('/api')) {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  }
  next();
});

// Diagnostic Route
app.get('/api/health', (req, res) => {
  const key = process.env.API_KEY || process.env.GEMINI_API_KEY;
  res.json({ 
    status: 'online', 
    apiKeyConfigured: !!key,
    envDetected: Object.keys(process.env).filter(k => k.includes('KEY')),
    timestamp: new Date().toISOString()
  });
});

app.post('/api/gemini', async (req, res) => {
  const { action, payload } = req.body;
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(401).json({ success: false, error: "API_KEY non trovata sul server Hostinger." });
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    if (action === 'process') {
      const { sku, ean, missingFields, pdfContextData, brandName } = payload;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Analizza SKU ${sku} (${brandName}). Campi richiesti: ${missingFields.map(f => f.name).join(',')}. Contesto: ${pdfContextData?.rawText?.substring(0, 5000)}`,
        config: {
          systemInstruction: "Sei un esperto catalogo. Rispondi solo in JSON validabile.",
          tools: [{ googleSearch: {} }]
        }
      });

      return res.json({ success: true, data: response.text });
    }

    if (action === 'explain' || action === 'generateSchema') {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: action === 'explain' ? `Spiega ${payload.fieldName}` : `Schema da ${payload.headers}`,
        config: { responseMimeType: "application/json" }
      });
      return res.json({ success: true, data: response.text });
    }

    res.status(400).json({ error: "Azione non riconosciuta" });
  } catch (error) {
    console.error("ERRORE AI:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serve static files dalla cartella dist
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback per rotte API non trovate
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `API endpoint ${req.url} not found on this server.` });
});

// Tutte le altre rotte caricano l'index.html (Single Page App)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Importante: Ascoltare su '0.0.0.0' per Hostinger
app.listen(PORT, '0.0.0.0', () => {
  console.log(`-----------------------------------------------`);
  console.log(`🚀 SERVER MASTER AI AVVIATO`);
  console.log(`📍 Porta: ${PORT}`);
  console.log(`🔑 API KEY: ${process.env.API_KEY || process.env.GEMINI_API_KEY ? 'CONFIGURATA ✅' : 'MANCANTE ❌'}`);
  console.log(`-----------------------------------------------`);
});
