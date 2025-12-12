
import * as pdfjsLib from 'pdfjs-dist';

// Initialize Worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs`;

export interface ParsedPdf {
  fileName: string;
  pages: { pageNumber: number; text: string }[];
}

// Helper per normalizzare le stringhe (rimuove spazi, simboli, tutto lowercase)
const normalizeForSearch = (str: string): string => {
  if (!str) return '';
  return String(str).toLowerCase().replace(/[^a-z0-9]/g, '');
};

export const extractTextFromPdf = async (file: File): Promise<ParsedPdf> => {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  
  const pages: { pageNumber: number; text: string }[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      // Join with space to avoid merging words, normalization will handle the rest
      const textItems = textContent.items.map((item: any) => item.str).join(' ');
      
      // Only store pages that have meaningful content (optimization)
      if (textItems.trim().length > 20) {
        pages.push({
          pageNumber: i,
          text: textItems
        });
      }
    } catch (e) {
      console.warn(`Error parsing page ${i} of ${file.name}`, e);
    }
  }

  return {
    fileName: file.name,
    pages
  };
};

// RAG LOGIC: Find relevant chunks for a specific SKU
export const findRelevantPdfContext = (
  pdfIndex: ParsedPdf[], 
  sku: string,
  ean: string
): string => {
  if (!sku && !ean) return "";

  const relevantChunks: string[] = [];
  
  // Normalizzazione aggressiva: rimuove spazi, trattini, punti. 
  // Es: "3888-012" diventa "3888012"
  const skuClean = normalizeForSearch(sku);
  const eanClean = normalizeForSearch(ean);

  // Evitiamo match su stringhe troppo corte che genererebbero falsi positivi (es. SKU "10")
  const isValidSku = skuClean.length >= 3; 
  const isValidEan = eanClean.length >= 5;

  for (const pdf of pdfIndex) {
    for (const page of pdf.pages) {
      // Normalizziamo anche il testo della pagina
      const pageTextClean = normalizeForSearch(page.text);
      
      const foundSku = isValidSku && pageTextClean.includes(skuClean);
      const foundEan = isValidEan && pageTextClean.includes(eanClean);

      if (foundSku || foundEan) {
        // Se troviamo un match "pulito", restituiamo il testo ORIGINALE (che ha formattazione e spazi corretti per l'AI)
        // Aggiungiamo un marker di evidenza
        const matchType = foundSku && foundEan ? 'SKU+EAN' : (foundSku ? 'SKU' : 'EAN');
        relevantChunks.push(`[FONTE: PDF "${pdf.fileName}" - Pagina ${page.pageNumber} - Match su ${matchType}]\n${page.text}\n-------------------`);
      }
    }
  }

  // Deduplicate and limit size
  return Array.from(new Set(relevantChunks)).join('\n\n');
};

// Helper to find best page match for a SKU (for image extraction)
export const findBestPageForSku = (
  pdfIndex: ParsedPdf[], 
  sku: string
): { fileName: string; pageNumber: number } | null => {
  if (!sku) return null;
  
  const skuClean = normalizeForSearch(sku);
  if (skuClean.length < 3) return null; // Too risky
  
  for (const pdf of pdfIndex) {
    for (const page of pdf.pages) {
      const pageTextClean = normalizeForSearch(page.text);
      
      // Use the cleaned text for finding the page
      if (pageTextClean.includes(skuClean)) {
        return { fileName: pdf.fileName, pageNumber: page.pageNumber };
      }
    }
  }
  return null;
};

// Render a specific PDF page to Base64 Image
export const renderPageToBase64 = async (file: File, pageNumber: number): Promise<string | null> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    if (pageNumber > pdf.numPages || pageNumber < 1) return null;

    const page = await pdf.getPage(pageNumber);
    
    // INCREASED SCALE to 2.5 (High Quality for OCR of small table numbers)
    const viewport = page.getViewport({ scale: 2.5 }); 
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context) return null;

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: context, viewport: viewport }).promise;
    
    // JPEG 0.85 quality
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    return dataUrl.split(',')[1];
  } catch (e) {
    console.warn(`Error rendering page ${pageNumber} of ${file.name}`, e);
    return null;
  }
};
