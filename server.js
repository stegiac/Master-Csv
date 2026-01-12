
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Fondamentale per Hostinger: gestisce correttamente il proxy inverso
app.set('trust proxy', 1);

app.use(express.json({ limit: '50mb' }));

const PORT = process.env.PORT || 3000;

// Log di avvio per debug nel pannello Hostinger
console.log('--- AVVIO SERVER MASTER AI ---');
console.log(`Node Version: ${process.version}`);
console.log(`Directory: ${__dirname}`);
console.log(`Porta configurata: ${PORT}`);
console.log(`API_KEY presente: ${process.env.API_KEY ? 'SI' : 'NO'}`);

// 1. ROTTE API (Priorità massima)
app.get('/api/health', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json({ 
    status: 'online', 
    apiKeyConfigured: !!process.env.API_KEY,
    timestamp: new Date().toISOString(),
    nodeVersion: process.version
  });
});

app.post('/api/gemini', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const { action, payload } = req.body;
  
  if (!process.env.API_KEY) {
    return res.status(401).json({ success: false, error: "ERRORE: API_KEY non configurata nelle variabili d'ambiente di Hostinger." });
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
        contents: `Spiega il campo "${fieldName}" (${description}) in una frase breve.`,
      });
      return res.json({ success: true, data: response.text });
    }

    if (action === 'generateSchema') {
      const { headers } = payload;
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Analizza intestazioni: ${headers.join(', ')}. Genera schema JSON.`,
        config: {
          systemInstruction: "Genera un array JSON di oggetti con {name, description, prompt, fieldClass}.",
          responseMimeType: "application/json"
        }
      });
      return res.json({ success: true, data: response.text });
    }
    
    res.status(400).json({ error: "Azione non valida" });
  } catch (error) {
    console.error("CRITICAL API ERROR:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. GESTIONE FILE STATICI
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// 3. SPA FALLBACK
app.get('*', (req, res) => {
  // Se è una richiesta API non trovata, non mandare l'HTML
  if (req.url.startsWith('/api')) {
    return res.status(404).json({ error: `Rotta API ${req.url} non definita.` });
  }
  
  // Per tutto il resto, manda l'app React
  const indexFile = path.join(distPath, 'index.html');
  res.sendFile(indexFile, (err) => {
    if (err) {
      res.status(500).send("Errore critico: Cartella 'dist' non trovata o index.html mancante. Esegui 'npm run build'.");
    }
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server pronto sulla porta ${PORT}`);
});
