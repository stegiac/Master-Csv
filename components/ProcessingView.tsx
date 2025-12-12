
import React, { useState, useEffect, useRef } from 'react';
import { Play, Download, Loader2, AlertTriangle, Check, Image as ImageIcon, FileText, ScrollText, X, Info, Globe, Eye, EyeOff, FileJson, BookOpen, BrainCircuit, RefreshCw } from 'lucide-react';
import { UploadedFile, SchemaField, FileType, ProcessedProduct, ColumnMapping, ProcessLog, AppSettings, PdfExtractedData } from '../types';
import { generateExcelExport } from '../services/excelService';
import { processProductWithGemini, urlToGenerativePart, batchAnalyzePdf } from '../services/geminiService';
import { extractTextFromPdf, findRelevantPdfContext, ParsedPdf, renderPageToBase64, findBestPageForSku } from '../services/pdfService';

interface Props {
  files: UploadedFile[];
  schema: SchemaField[];
  settings: AppSettings;
  brandName: string;
  baseImageColumn: string;
  baseSkuColumn: string;
  baseEanColumn: string;
  manuSkuColumn: string;
  manuEanColumn: string;
  manuDescColumn: string;
  columnMapping: ColumnMapping;
}

const ProcessingView: React.FC<Props> = ({ 
  files, 
  schema, 
  settings, 
  brandName,
  baseImageColumn,
  baseSkuColumn,
  baseEanColumn,
  manuSkuColumn,
  manuEanColumn,
  manuDescColumn,
  columnMapping 
}) => {
  const [products, setProducts] = useState<ProcessedProduct[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingPhase, setProcessingPhase] = useState<'idle' | 'pdf_indexing' | 'pdf_analysis' | 'product_processing'>('idle');
  const [progress, setProgress] = useState(0);
  const [pdfProgress, setPdfProgress] = useState(0); 
  const [selectedLogProduct, setSelectedLogProduct] = useState<ProcessedProduct | null>(null);
  const [showSources, setShowSources] = useState(false);
  
  // PDF Indexing Cache (In-memory)
  const [parsedPdfs, setParsedPdfs] = useState<ParsedPdf[]>([]);

  // PDF Knowledge Base: SKU -> Extracted Data
  const [pdfKnowledgeBase, setPdfKnowledgeBase] = useState<Record<string, PdfExtractedData>>({});

  const abortControllerRef = useRef<AbortController | null>(null);

  const baseFile = files.find(f => f.type === FileType.BASE);
  const manuFile = files.find(f => f.type === FileType.MANUFACTURER);
  const pdfFiles = files.filter(f => f.type === FileType.PDF);

  useEffect(() => {
    if (baseFile && products.length === 0) {
      const initialProducts: ProcessedProduct[] = baseFile.data.map((row: any) => {
        // Safe extraction of SKU and EAN ensuring they are Strings
        const rawSku = baseSkuColumn ? row[baseSkuColumn] : (row['SKU'] || row['sku'] || 'UNKNOWN');
        const rawEan = baseEanColumn ? row[baseEanColumn] : (row['EAN'] || row['ean'] || 'UNKNOWN');

        return {
          sku: rawSku !== null && rawSku !== undefined ? String(rawSku) : 'UNKNOWN',
          ean: rawEan !== null && rawEan !== undefined ? String(rawEan) : 'UNKNOWN',
          status: 'pending',
          data: {},
          sourceMap: {},
          logs: []
        };
      });
      setProducts(initialProducts);
    }
  }, [baseFile, baseSkuColumn, baseEanColumn]);

  const addLog = (product: ProcessedProduct, message: string, type: ProcessLog['type'] = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    product.logs.push({ timestamp, message, type });
  };

  const startProcessing = async () => {
    if (!baseFile) return;
    if (!baseSkuColumn || !baseEanColumn) {
       const proceed = confirm("Attenzione: Colonne SKU o EAN del file Base non selezionate. Vuoi continuare?");
       if (!proceed) return;
    }

    setIsProcessing(true);
    abortControllerRef.current = new AbortController();

    // --- PHASE 0: PDF TEXT INDEXING (One-time) ---
    let currentParsedPdfs = [...parsedPdfs];
    
    // Only parse if we have new PDFs or haven't parsed yet
    if (pdfFiles.length > 0 && currentParsedPdfs.length !== pdfFiles.length) {
       setProcessingPhase('pdf_indexing');
       const newParsedPdfs: ParsedPdf[] = [];
       
       for(let i=0; i < pdfFiles.length; i++) {
         const pdf = pdfFiles[i];
         // Check if already parsed (optimization needed in real app, simplified here)
         if(pdf.rawFile) {
            setPdfProgress(Math.round((i / pdfFiles.length) * 100));
            try {
              const parsed = await extractTextFromPdf(pdf.rawFile);
              newParsedPdfs.push(parsed);
            } catch(e) {
              console.error(`Failed to index PDF ${pdf.name}`, e);
            }
         }
       }
       currentParsedPdfs = newParsedPdfs;
       setParsedPdfs(newParsedPdfs);
    }

    // --- PHASE 1: BATCH PDF ANALYSIS (Using Retrieval / Chunking) ---
    // Improved: More robust retrieval logic in pdfService handles normalization
    if (currentParsedPdfs.length > 0 && Object.keys(pdfKnowledgeBase).length === 0) {
      setProcessingPhase('pdf_analysis');
      
      const allSkus = products.map(p => p.sku).filter(s => s && s !== 'UNKNOWN');
      const CHUNK_SIZE = 5; 
      const skuChunks = [];
      for (let i = 0; i < allSkus.length; i += CHUNK_SIZE) {
        skuChunks.push(allSkus.slice(i, i + CHUNK_SIZE));
      }

      const tempKnowledgeBase: Record<string, PdfExtractedData> = {};

      for (let i = 0; i < skuChunks.length; i++) {
        const chunkSkus = skuChunks[i];
        setPdfProgress(Math.round(((i) / skuChunks.length) * 100));
        
        try {
          // Retrieval
          let contextText = "";
          for(const sku of chunkSkus) {
             contextText += findRelevantPdfContext(currentParsedPdfs, sku, "");
          }

          // Generation
          if (contextText.length > 20) { 
             const batchResult = await batchAnalyzePdf(contextText, chunkSkus, brandName);
             Object.assign(tempKnowledgeBase, batchResult);
          }
          
        } catch (err) {
          console.error("Batch PDF Error", err);
        }
        
        await new Promise(r => setTimeout(r, 500)); // Lower delay
      }
      
      setPdfKnowledgeBase(tempKnowledgeBase);
      setPdfProgress(100);
    }

    // --- PHASE 2: PRODUCT PROCESSING ---
    setProcessingPhase('product_processing');

    const newProducts = [...products];
    // Calculate initial completion for progress bar (if restarting)
    let completed = newProducts.filter(p => p.status === 'completed').length;

    for (let i = 0; i < newProducts.length; i++) {
      // Skip completed. PROCESS 'pending' AND 'error' (if explicitly retrying, status would be pending)
      if (newProducts[i].status === 'completed') {
        continue;
      }
      
      const currentProd = newProducts[i];
      currentProd.logs = []; 
      currentProd.status = 'processing';
      currentProd.error = undefined; // Clear previous errors
      addLog(currentProd, `Inizio elaborazione SKU: ${currentProd.sku}`, 'info');
      setProducts([...newProducts]);

      try {
        const currentSku = currentProd.sku;
        const currentEan = currentProd.ean;
        const baseRow = baseFile.data[i]; 

        // 1. Manufacturer Data
        let manuData = null;
        let mappedValues: Record<string, any> = {};
        let manuDescription = ""; 

        if (manuFile) {
          manuData = manuFile.data.find((row: any) => {
            const cSku = String(currentSku || '').trim().toLowerCase();
            const cEan = String(currentEan || '').trim().toLowerCase();
            const mSku = manuSkuColumn ? String(row[manuSkuColumn] || '').trim().toLowerCase() : '';
            const mEan = manuEanColumn ? String(row[manuEanColumn] || '').trim().toLowerCase() : '';
            return (manuSkuColumn && cSku && mSku && cSku === mSku) || (manuEanColumn && cEan && mEan && cEan === mEan);
          });

          if (manuData) {
             addLog(currentProd, "✅ Corrispondenza trovata nel File Produttore.", 'success');
             schema.forEach(field => {
               const mappedCol = columnMapping[field.id];
               if (mappedCol && manuData[mappedCol] !== undefined) mappedValues[field.name] = manuData[mappedCol];
             });

             if (manuDescColumn && manuData[manuDescColumn]) {
                manuDescription = String(manuData[manuDescColumn]);
                addLog(currentProd, `📝 Testo descrittivo estratto da colonna selezionata "${manuDescColumn}".`, 'info');
             } else {
                 const relevantKeys = Object.keys(manuData).filter(key => {
                    const k = key.toLowerCase();
                    return (k.includes('desc') || k.includes('note') || k.includes('info') || k.includes('spec') || k.includes('dett')) && 
                           !k.includes('sku') && !k.includes('ean') && !k.includes('cod');
                 });
                 if (relevantKeys.length > 0) {
                   manuDescription = relevantKeys.map(k => `${k}: ${manuData[k]}`).join('\n');
                   addLog(currentProd, "📝 Testo descrittivo produttore individuato per estrazione (Auto).", 'info');
                 }
             }
          }
        }

        // 2. Base Image
        let imageBase64Part = null;
        if (baseImageColumn && baseRow[baseImageColumn]) {
           const imgUrl = baseRow[baseImageColumn];
           if (imgUrl && (imgUrl.startsWith('http') || imgUrl.startsWith('https'))) {
             imageBase64Part = await urlToGenerativePart(imgUrl);
             if (imageBase64Part) addLog(currentProd, "✅ Immagine Prodotto scaricata per analisi visiva.", 'success');
           }
        }

        // 3. PDF Context & Visual Analysis (ENHANCED LOGIC)
        // Check Knowledge Base first
        let pdfContext = pdfKnowledgeBase[currentSku];
        let pdfPageImage = null;
        
        // Find Best Page (Normalized Search)
        const bestPageMatch = findBestPageForSku(currentParsedPdfs, currentSku);

        if (bestPageMatch) {
            const pdfFile = files.find(f => f.name === bestPageMatch.fileName && f.type === FileType.PDF);
            if (pdfFile && pdfFile.rawFile) {
                
                // A. Render Image (Crucial for Table reading)
                pdfPageImage = await renderPageToBase64(pdfFile.rawFile, bestPageMatch.pageNumber);
                if (pdfPageImage) {
                    addLog(currentProd, `🖼️ Estratta immagine Pagina ${bestPageMatch.pageNumber} del PDF (verrà usata per leggere le tabelle).`, 'info');
                }

                // B. Force Raw Text Injection (If Batch Analysis missed it)
                if (!pdfContext) {
                    const parsedPdfFile = currentParsedPdfs.find(p => p.fileName === bestPageMatch.fileName);
                    const rawPageText = parsedPdfFile?.pages.find(p => p.pageNumber === bestPageMatch.pageNumber)?.text;
                    
                    if (rawPageText) {
                         // Construct on-the-fly context
                         pdfContext = {
                             sku: currentSku,
                             data: {}, // AI will extract this from raw text + image
                             visuals: {},
                             sourcePage: `Pagina ${bestPageMatch.pageNumber} (Raw Text)`
                         };
                         // Append raw text to context data for the prompt
                         (pdfContext as any).rawTextOverride = rawPageText;
                         addLog(currentProd, `📖 Testo grezzo recuperato dalla Pagina ${bestPageMatch.pageNumber} (Backup RAG).`, 'info');
                    }
                }
            }
        }

        if (pdfContext) {
           currentProd.pdfContextData = pdfContext;
           addLog(currentProd, `📄 Dati PDF pronti per l'analisi.`, 'success');
        } else if (currentParsedPdfs.length > 0) {
           addLog(currentProd, "ℹ️ Nessun dato PDF trovato (nemmeno con ricerca diretta).", 'info');
        }

        // 4. Gemini Call
        addLog(currentProd, "🤖 Elaborazione Finale AI (Merge Dati + Visual + Web)", 'info');
        
        const { data: resultData, sourceMap, sources, rawResponse } = await processProductWithGemini({
          sku: currentSku,
          ean: currentEan,
          manufacturerData: manuData,
          manufacturerDescription: manuDescription,
          pdfContextData: pdfContext, 
          schema: schema,
          trustedDomains: settings.trustedDomains,
          dataPriority: settings.dataPriority,
          brandName: brandName,
          imageBase64Part: imageBase64Part,
          pdfPageImage: pdfPageImage, 
          mappedValues: mappedValues
        });

        if (sources && sources.length > 0) {
           addLog(currentProd, `🌍 Web: ${sources.length} fonti consultate.`, 'success');
        }

        newProducts[i] = {
          ...currentProd,
          status: 'completed',
          data: resultData,
          sourceMap: sourceMap,
          rawResponse: rawResponse
        };

      } catch (error: any) {
        console.error("Error processing item", i, error);
        addLog(currentProd, `❌ Errore: ${error.message}`, 'error');
        newProducts[i] = { ...currentProd, status: 'error', error: error.message };
      }

      completed++;
      setProgress(Math.round((completed / newProducts.length) * 100));
      setProducts([...newProducts]);
      
      // Throttle
      await new Promise(r => setTimeout(r, 1500));
    }

    setIsProcessing(false);
    setProcessingPhase('idle');
  };

  const handleRetryFailed = () => {
    // Reset status of error items to 'pending' so startProcessing picks them up
    const resetProducts = products.map(p => 
      p.status === 'error' ? { ...p, status: 'pending', error: undefined, logs: [] } as ProcessedProduct : p
    );
    setProducts(resetProducts);
    // Logic: The user will click "Start" again, which picks up 'pending' items.
    // We don't auto-start to give user control.
  };

  const handleExport = () => {
    const exportData = products.map(p => {
      const row: any = { SKU: p.sku, EAN: p.ean };
      schema.forEach(field => { 
        if (field.enabled) {
            let val = p.data[field.name];
            if (val === undefined || val === null || val === 'null' || val === 'NULL' || val === 'N/D') {
                val = '';
            }
            row[field.name] = val;
        }
      });
      return row;
    });

    const sourceData = products.map(p => {
      const row: any = { SKU: p.sku, EAN: p.ean };
      schema.forEach(field => { if (field.enabled) row[field.name] = p.sourceMap?.[field.name] || (p.data[field.name] ? 'N/D' : ''); });
      return row;
    });

    generateExcelExport(exportData, sourceData, `export_${brandName || 'prodotti'}_ai`);
  };
  
  const handleDownloadLogs = () => {
     if (products.length === 0) return;
    
    let logContent = `LOG ELABORAZIONE E-COM IMPORT AI\nData: ${new Date().toLocaleString()}\n\n`;
    
    products.forEach(p => {
      logContent += `------------------------------------------------\n`;
      logContent += `PRODOTTO: SKU [${p.sku}] - EAN [${p.ean}]\n`;
      logContent += `STATO: ${p.status.toUpperCase()}\n`;
      logContent += `LOGS:\n`;
      p.logs.forEach(l => {
        logContent += `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.message}\n`;
      });
      if (p.pdfContextData) {
         logContent += `\n[PDF CONTEXT DATA FOUND]\n`;
         logContent += JSON.stringify(p.pdfContextData, null, 2);
      }
      if (p.rawResponse) {
        logContent += `\n--- RISPOSTA AI GREZZA ---\n${p.rawResponse}\n`;
      }
      logContent += `\n`;
    });

    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs_${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!baseFile) return <div className="text-center p-10 text-gray-500">Carica prima il file base nella tab Import.</div>;

  const failedCount = products.filter(p => p.status === 'error').length;
  const pendingCount = products.filter(p => p.status === 'pending').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative">
      <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div>
          <h3 className="text-lg font-bold text-gray-800">Elaborazione Prodotti</h3>
          <p className="text-sm text-gray-500">
            {products.length} prodotti in coda.
            {pdfFiles.length > 0 && <span className="block mt-1 text-red-600 font-medium flex items-center gap-1"><BookOpen size={14}/> {pdfFiles.length} Cataloghi PDF pronti per indicizzazione</span>}
          </p>
        </div>
        <div className="flex flex-col gap-2 items-end">
          <div className="flex gap-3">
             {!isProcessing && pendingCount > 0 && (
              <button onClick={startProcessing} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg shadow-md font-medium transition-all">
                <Play size={20} fill="currentColor" /> {progress > 0 ? 'Riprendi Elaborazione' : 'Avvia Elaborazione AI'}
              </button>
             )}
             {isProcessing && (
               <button disabled className="flex items-center gap-2 bg-indigo-400 text-white px-6 py-3 rounded-lg cursor-not-allowed min-w-[280px] justify-center">
                 <Loader2 size={20} className="animate-spin" /> 
                 {processingPhase === 'pdf_indexing' && `Indicizzazione Cataloghi (${pdfProgress}%)`}
                 {processingPhase === 'pdf_analysis' && `Analisi Batch SKU (${pdfProgress}%)`}
                 {processingPhase === 'product_processing' && `Generazione Schede (${progress}%)`}
               </button>
             )}
             {progress > 0 && !isProcessing && (
               <button onClick={handleExport} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg shadow-md font-medium transition-all">
                 <Download size={20} /> Scarica Excel
               </button>
             )}
          </div>
          <div className="flex gap-2">
             <button onClick={() => setShowSources(!showSources)} className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium border transition-colors ${showSources ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                {showSources ? <Eye size={14} /> : <EyeOff size={14} />} {showSources ? 'Mostra Valori' : 'Mostra Fonti'}
             </button>
             <button onClick={handleDownloadLogs} className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100">
               <FileText size={14} /> Scarica Log
             </button>
          </div>
        </div>
      </div>

      {isProcessing && (
        <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg flex items-center gap-3 animate-pulse">
           {processingPhase === 'pdf_indexing' && <BrainCircuit className="text-blue-600" />}
           {processingPhase === 'pdf_analysis' && <BookOpen className="text-blue-600" />}
           {processingPhase === 'product_processing' && <Info className="text-blue-600" />}
           
           <div>
             <h4 className="font-bold text-blue-800 text-sm uppercase">
               {processingPhase === 'pdf_indexing' && 'FASE 1: Indicizzazione Testuale Cataloghi'}
               {processingPhase === 'pdf_analysis' && 'FASE 2: Analisi Context-Aware (RAG)'}
               {processingPhase === 'product_processing' && 'FASE 3: Generazione Schede Finali'}
             </h4>
             <p className="text-xs text-blue-600">
               {processingPhase === 'pdf_indexing' && 'Sto leggendo i PDF pagina per pagina e creando un indice di ricerca locale...'}
               {processingPhase === 'pdf_analysis' && 'Sto cercando gli SKU specifici all\'interno dei chunk di testo indicizzati...'}
               {processingPhase === 'product_processing' && 'Sto unendo i dati del produttore, web e analisi PDF (Testuale + Visiva) per generare le schede finali...'}
             </p>
           </div>
        </div>
      )}

      {/* ERROR / RETRY BANNER */}
      {!isProcessing && failedCount > 0 && (
         <div className="bg-red-50 border border-red-200 p-4 rounded-lg flex items-center justify-between animate-in slide-in-from-top-2">
            <div className="flex items-center gap-3">
              <AlertTriangle className="text-red-600" size={24} />
              <div>
                <h4 className="font-bold text-red-800">Elaborazione completata con Errori</h4>
                <p className="text-sm text-red-600">{failedCount} prodotti non sono stati elaborati correttamente.</p>
              </div>
            </div>
            <button 
              onClick={handleRetryFailed}
              className="bg-white border border-red-300 text-red-700 px-4 py-2 rounded-lg font-medium hover:bg-red-100 flex items-center gap-2 transition-colors shadow-sm"
            >
              <RefreshCw size={18} /> Ripristina Falliti e Riprova
            </button>
         </div>
      )}

      {(progress > 0 || pdfProgress > 0) && (
        <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
          <div className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500" style={{ width: `${(processingPhase === 'pdf_indexing' || processingPhase === 'pdf_analysis') ? pdfProgress : progress}%` }}></div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-500">
            <thead className="text-xs text-gray-700 uppercase bg-gray-100">
              <tr>
                <th className="px-4 py-3 w-10">Stato</th>
                <th className="px-4 py-3 w-10">Log</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">EAN</th>
                {schema.filter(f => f.enabled).map(f => (
                  <th key={f.id} className="px-4 py-3 min-w-[200px]">{f.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map((p, idx) => (
                <tr key={idx} className={`border-b hover:bg-gray-50 ${p.status === 'error' ? 'bg-red-50' : 'bg-white'}`}>
                  <td className="px-4 py-4">
                    {p.status === 'pending' && <span className="w-3 h-3 rounded-full bg-gray-300 block" />}
                    {p.status === 'processing' && <Loader2 size={16} className="animate-spin text-indigo-600" />}
                    {p.status === 'completed' && <Check size={16} className="text-green-600" />}
                    {p.status === 'error' && <AlertTriangle size={16} className="text-red-500" />}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <button onClick={() => setSelectedLogProduct(p)} className="text-gray-400 hover:text-indigo-600">
                      <ScrollText size={18} />
                    </button>
                  </td>
                  <td className="px-4 py-4 font-medium text-gray-900">{p.sku}</td>
                  <td className="px-4 py-4">{p.ean}</td>
                  {schema.filter(f => f.enabled).map(f => (
                    <td key={f.id} className={`px-4 py-4 truncate max-w-xs ${showSources ? 'text-xs italic text-purple-600' : ''}`} title={showSources ? p.sourceMap?.[f.name] : p.data[f.name]}>
                      {showSources ? (p.sourceMap?.[f.name] || (p.data[f.name] ? 'AI/Auto' : '-')) : (p.data[f.name] || '-')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {selectedLogProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
              <div>
                <h4 className="font-bold text-lg text-gray-800">Log Elaborazione</h4>
                <p className="text-sm text-gray-500">SKU: {selectedLogProduct.sku}</p>
              </div>
              <button onClick={() => setSelectedLogProduct(null)} className="p-2 hover:bg-gray-200 rounded-full"><X size={20} /></button>
            </div>
            
            <div className="flex-grow overflow-hidden flex flex-col">
               <div className="p-4 bg-gray-50/50 overflow-y-auto border-b border-gray-100 max-h-[40vh]">
                  {selectedLogProduct.logs.map((log, idx) => (
                      <div key={idx} className={`flex gap-3 p-2 rounded-lg border mb-2 ${log.type === 'error' ? 'bg-red-50 border-red-100 text-red-800' : log.type === 'success' ? 'bg-green-50 border-green-100 text-green-800' : 'bg-white border-gray-100'}`}>
                        <p className="text-sm font-medium">{log.message}</p>
                      </div>
                  ))}
               </div>

               {selectedLogProduct.pdfContextData && (
                 <div className="p-4 bg-yellow-50 border-b border-yellow-100">
                   <h5 className="text-xs font-bold text-yellow-700 uppercase mb-2 flex items-center gap-2"><BookOpen size={14}/> Dati Estratti da PDF (RAG Cache)</h5>
                   <pre className="text-[10px] text-yellow-800 overflow-x-auto bg-yellow-50/50 p-2 rounded">{JSON.stringify(selectedLogProduct.pdfContextData, null, 2)}</pre>
                 </div>
               )}

               <div className="p-4 bg-white overflow-y-auto flex-grow">
                  <h5 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-2"><FileJson size={14}/> Risposta AI Grezza</h5>
                  <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs font-mono overflow-x-auto whitespace-pre-wrap">{selectedLogProduct.rawResponse || 'N/A'}</pre>
               </div>
            </div>
            <div className="p-4 border-t border-gray-100 text-right bg-white rounded-b-xl">
              <button onClick={() => setSelectedLogProduct(null)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium">Chiudi</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ProcessingView;
