import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Usa la porta fornita dall'ambiente (Hostinger) o la 3000 come fallback
const PORT = process.env.PORT || 3000;

// Serve i file statici dalla cartella 'dist' (generata da 'npm run build')
app.use(express.static(path.join(__dirname, 'dist')));

// Per qualsiasi altra richiesta, restituisci l'index.html (per il routing lato client)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server avviato sulla porta ${PORT}`);
  console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
});