
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Trust proxy è fondamentale su Hostinger per recuperare IP e protocollo corretti
app.set('trust proxy', 1);

app.use(express.json({ limit: '50mb' }));

const PORT = process.env.PORT || 3000;

// Middleware di logging per debug in produzione (visibile nei log di Hostinger)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// 1. ROTTE API (Devono essere definite PRIMA dei file statici)
app.get('/api/health', (req, res) => {
  const key = process.env.API_KEY;
  res.setHeader('Content-Type', 'application/json');
  res.json({ 
    status: 'online', 
    apiKeyConfigured: !!key,
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'production'
  });
});

app.post('/api/gemini', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const { action, payload } = req.body;
  
  if (!process.env.API_KEY) {
    return res.status(401).json({ success: false, error: "API_KEY non configurata sul server Hostinger." });
  }

  try {
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
      return res.json({ success: true, data: response.text });
    }

    if (action === 'explain') {
      const { fieldName, description } = payload;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Spiega il significato del campo "${fieldName}" (${description}) in una frase.`,
      });
      return res.json({ success: true, data: response.text });
    }

    if (action === 'generateSchema') {
      const { headers } = payload;
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Analizza intestazioni: ${headers.join(', ')}. Genera schema JSON di mappatura.`,
        config: {
          systemInstruction: "Genera un array JSON di oggetti con {name, description, prompt, fieldClass}.",
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

// 2. FILE STATICI (Dopo le API)
// Assicurati che la cartella 'dist' esista dopo il build
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// 3. SPA FALLBACK (Sempre per ultimo)
app.get('*', (req, res) => {
  if (req.url.startsWith('/api')) {
    return res.status(404).json({ error: `API ${req.url} non trovata.` });
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Master AI Server in esecuzione su porta ${PORT}`);
  console.log(`📂 Cartella statici: ${distPath}`);
});
