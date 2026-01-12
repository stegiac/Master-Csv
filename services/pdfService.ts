
import * as pdfjsLib from 'pdfjs-dist';

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
  console.log(`[PDF] Inizio estrazione: ${file.name}`);
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const pages: { pageNumber: number; text: string }[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const textItems = textContent.items.map((item: any) => item.str).join(' ');
      if (textItems.trim().length > 5) {
        pages.push({ pageNumber: i, text: textItems });
      }
    } catch (e) {
      console.warn(`[PDF] Errore pagina ${i}: ${file.name}`, e);
    }
  }
  console.log(`[PDF] Estrazione completata: ${file.name} (${pages.length} pagine utili)`);
  return { fileName: file.name, pages };
};

/**
 * Ricerca ottimizzata dello SKU/EAN nel PDF
 */
export const findRelevantPdfContext = (
  pdfIndex: ParsedPdf[], 
  sku: string,
  ean: string
): { context: string, rawText: string, source: string } => {
  if (!sku && !ean) return { context: "", rawText: "", source: "" };

  const skuClean = normalizeForSearch(sku);
  const eanClean = normalizeForSearch(ean);
  
  for (const pdf of pdfIndex) {
    for (const page of pdf.pages) {
      // Ottimizzazione: check semplice prima della normalizzazione pesante
      const pageTextClean = normalizeForSearch(page.text);
      
      const foundEan = eanClean.length > 5 && pageTextClean.includes(eanClean);
      const foundSku = skuClean.length > 3 && pageTextClean.includes(skuClean);

      if (foundEan || foundSku) {
        console.log(`[PDF] Trovata corrispondenza in ${pdf.fileName} pag ${page.pageNumber}`);
        return {
          context: `[PDF: ${pdf.fileName} - P. ${page.pageNumber}]`,
          rawText: page.text,
          source: `${pdf.fileName} (P. ${page.pageNumber})`
        };
      }
    }
  }
  return { context: "", rawText: "", source: "" };
};
