
import * as pdfjsLib from 'pdfjs-dist';

// Configurazione Worker tramite unpkg per garantire compatibilità con i moduli ESM
// Utilizziamo la versione specifica per coerenza con l'import map di index.html
const PDFJS_VERSION = '5.4.530';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

export interface ParsedPdf {
  fileName: string;
  pages: { pageNumber: number; text: string }[];
}

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
      const textItems = textContent.items.map((item: any) => item.str).join(' ');
      if (textItems.trim().length > 10) {
        pages.push({ pageNumber: i, text: textItems });
      }
    } catch (e) {
      console.warn(`Errore parsing pagina ${i} di ${file.name}`, e);
    }
  }
  return { fileName: file.name, pages };
};

/**
 * Ricerca robusta dello SKU/EAN nel PDF
 */
export const findRelevantPdfContext = (
  pdfIndex: ParsedPdf[], 
  sku: string,
  ean: string
): { context: string, rawText: string, source: string } => {
  if (!sku && !ean) return { context: "", rawText: "", source: "" };

  const skuClean = normalizeForSearch(sku);
  const eanClean = normalizeForSearch(ean);
  
  const skuRegex = new RegExp(`(^|[^a-z0-9])${skuClean}([^a-z0-9]|$)`, 'i');

  for (const pdf of pdfIndex) {
    for (const page of pdf.pages) {
      const pageTextClean = normalizeForSearch(page.text);
      
      const foundEan = eanClean.length > 5 && pageTextClean.includes(eanClean);
      const foundSku = skuClean.length > 2 && skuRegex.test(pageTextClean);

      if (foundEan || foundSku) {
        return {
          context: `[FONTE PDF: ${pdf.fileName} - Pag. ${page.pageNumber}]`,
          rawText: page.text,
          source: `${pdf.fileName} (Pag. ${page.pageNumber})`
        };
      }
    }
  }
  return { context: "", rawText: "", source: "" };
};

export const findBestPageForSku = (pdfIndex: ParsedPdf[], sku: string) => {
  const skuClean = normalizeForSearch(sku);
  const skuRegex = new RegExp(`(^|[^a-z0-9])${skuClean}([^a-z0-9]|$)`, 'i');
  
  for (const pdf of pdfIndex) {
    for (const page of pdf.pages) {
      if (skuClean.length > 2 && skuRegex.test(normalizeForSearch(page.text))) {
        return { fileName: pdf.fileName, pageNumber: page.pageNumber };
      }
    }
  }
  return null;
};

export const renderPageToBase64 = async (file: File, pageNumber: number): Promise<string | null> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2.0 }); 
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return null;
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    await page.render({ canvasContext: context, viewport: viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
  } catch (e) {
    return null;
  }
};
