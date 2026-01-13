
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '50mb' }));

const PORT = process.env.PORT || 3000;
const distPath = path.resolve(__dirname, 'dist');

console.log('--- DIAGNOSTICA SERVER ---');
console.log(`Node: ${process.version}`);
console.log(`Porta: ${PORT}`);
console.log(`Path Dist: ${distPath}`);
console.log(`Dist esiste: ${fs.existsSync(distPath)}`);
console.log(`API_KEY presente: ${!!process.env.API_KEY}`);

// Endpoint di controllo salute con info extra per debug
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'online', 
    serverTime: new Date().toISOString(),
    nodeVersion: process.version,
    env: process.env.NODE_ENV || 'production',
    apiKeyConfigured: !!process.env.API_KEY,
    dirContent: fs.existsSync(distPath) ? 'dist_found' : 'dist_missing'
  });
});

app.post('/api/gemini', async (req, res) => {
  const { action, payload } = req.body;
  
  if (!process.env.API_KEY) {
    return res.status(500).json({ success: false, error: "API_KEY mancante nelle variabili d'ambiente di Hostinger." });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    if (action === 'process') {
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Analizza SKU ${payload.sku}. Contesto: ${payload.pdfContextData?.rawText?.substring(0, 5000)}`,
        config: {
          systemInstruction: "Estrai dati tecnici in JSON.",
          tools: [{ googleSearch: {} }]
        }
      });
      return res.json({ success: true, data: response.text });
    }

    if (action === 'explain') {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Spiega il campo ${payload.fieldName}`,
      });
      return res.json({ success: true, data: response.text });
    }
    
    res.status(400).json({ error: "Azione non valida" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serve i file statici
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: "API non trovata" });
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  app.get('*', (req, res) => {
    res.status(500).send("Errore critico: Cartella 'dist' non trovata. Assicurati che 'npm run build' sia stato eseguito.");
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server attivo sulla porta ${PORT}`);
});
