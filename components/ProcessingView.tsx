
import React, { useState, useEffect, useRef } from 'react';
import { Play, Download, Loader2, AlertTriangle, Check, ScrollText, X, Info, ShieldCheck, Database, AlertCircle, Bookmark, Zap, ExternalLink, Terminal, ChevronDown, ChevronUp, Lock } from 'lucide-react';
import { UploadedFile, SchemaField, FileType, ProcessedProduct, ColumnMapping, AppSettings, SourceInfo } from '../types';
import { generateExcelExport } from '../services/excelService';
import { processProductWithGemini } from '../services/geminiService';
import { extractTextFromPdf, findRelevantPdfContext, ParsedPdf } from '../services/pdfService';

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

interface LogEntry {
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'warn' | 'error' | 'ai';
}

const ProcessingView: React.FC<Props> = ({ 
  files, schema, settings, brandName,
  baseImageColumn, baseSkuColumn, baseEanColumn,
  manuSkuColumn, manuEanColumn, manuDescColumn, columnMapping 
}) => {
  const [products, setProducts] = useState<ProcessedProduct[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [parsedPdfs, setParsedPdfs] = useState<ParsedPdf[]>([]);
  const [selectedLogProduct, setSelectedLogProduct] = useState<ProcessedProduct | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showTerminal, setShowTerminal] = useState(true);
  const [currentTask, setCurrentTask] = useState<string>('In attesa...');
  
  const terminalRef = useRef<HTMLDivElement>(null);

  const baseFile = files.find(f => f.type === FileType.BASE);
  const manuFile = files.find(f => f.type === FileType.MANUFACTURER);
  const pdfFiles = files.filter(f => f.type === FileType.PDF);

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    const entry = { timestamp: new Date().toLocaleTimeString(), message, type };
    setLogs(prev => [entry, ...prev].slice(0, 100));
  };

  useEffect(() => {
    if (baseFile && products.length === 0) {
      const initial = baseFile.data.map((row: any) => ({
        sku: String(row[baseSkuColumn] || row['SKU'] || 'UNKNOWN'),
        ean: String(row[baseEanColumn] || row['EAN'] || 'UNKNOWN'),
        status: 'pending',
        data: {},
        sourceMap: {},
        logs: []
      }));
      setProducts(initial as any);
      addLog(`Rilevati ${initial.length} articoli da elaborare.`, 'info');
    }
  }, [baseFile, baseSkuColumn, baseEanColumn]);

  const hasBlockingErrors = () => {
    return products.some(p => 
      // Fix: Explicitly cast to SourceInfo[] to fix 'unknown' type error in hasBlockingErrors
      (Object.values(p.sourceMap) as SourceInfo[]).some(audit => 
        audit.warnings?.some(w => w.action === 'block_export')
      )
    );
  };

  const startProcessing = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    addLog("Inizio pipeline industriale...", 'info');

    let currentParsed = [...parsedPdfs];
    if (pdfFiles.length > 0 && currentParsed.length === 0) {
      setCurrentTask("Indicizzazione cataloghi PDF...");
      const indexed: ParsedPdf[] = [];
      for(let f of pdfFiles) {
        if (f.rawFile) {
          try {
            const parsed = await extractTextFromPdf(f.rawFile);
            indexed.push(parsed);
            addLog(`PDF ${f.name} indicizzato (${parsed.pages.length} pgg).`, 'success');
          } catch(e: any) {
            addLog(`Errore PDF ${f.name}: ${e.message}`, 'error');
          }
        }
      }
      currentParsed = indexed;
      setParsedPdfs(indexed);
    }

    const total = products.length;
    let completedCount = 0;

    for (let i = 0; i < total; i++) {
      const p = products[i];
      if (p.status === 'completed') { completedCount++; continue; }

      addLog(`[${i+1}/${total}] Elaborazione ${p.sku}...`, 'info');
      setCurrentTask(`Articolo ${i+1}/${total}: ${p.sku}`);
      
      setProducts(prev => {
        const next = [...prev];
        next[i] = { ...next[i], status: 'processing' };
        return next;
      });

      try {
        const pdfContext = findRelevantPdfContext(currentParsed, p.sku, p.ean);
        const mappedValues: Record<string, any> = {};
        let manuData = null;

        if (manuFile) {
          manuData = manuFile.data.find((row: any) => String(row[manuSkuColumn]) === p.sku);
          if (manuData) {
            schema.forEach(field => {
              const col = columnMapping[field.id];
              if (col && manuData[col]) mappedValues[field.id] = manuData[col];
            });
          }
        }

        const result = await processProductWithGemini({
          sku: p.sku, ean: p.ean, brandName, schema,
          manufacturerData: manuData,
          pdfContextData: pdfContext.rawText ? { sku: p.sku, rawText: pdfContext.rawText } : undefined,
          mappedValues,
          trustedDomains: settings.trustedDomains
        });

        setProducts(prev => {
          const next = [...prev];
          next[i] = { 
            ...next[i], 
            data: result.values, 
            sourceMap: result.audit, 
            rawResponse: result.rawResponse,
            status: 'completed' 
          };
          return next;
        });
        addLog(`Completato: ${p.sku}`, 'success');

      } catch (e: any) {
        addLog(`ERRORE [${p.sku}]: ${e.message}`, 'error');
        setProducts(prev => {
          const next = [...prev];
          next[i] = { ...next[i], status: 'error', error: e.message };
          return next;
        });
        if (e.message.includes("401") || e.message.includes("TIMEOUT")) break;
      }

      completedCount++;
      setProgress(Math.round((completedCount / total) * 100));
      await new Promise(r => setTimeout(r, 300));
    }

    setIsProcessing(false);
    setCurrentTask("Pipeline terminata.");
  };

  const handleExport = () => {
    if (hasBlockingErrors()) {
      alert("ATTENZIONE: Esportazione bloccata. Sono presenti errori critici di validazione (campi obbligatori mancanti o valori non ammessi). Controlla gli Audit.");
      return;
    }
    const data = products.map(p => ({ SKU: p.sku, EAN: p.ean, ...p.data }));
    const sources = products.map(p => {
      const s: any = { SKU: p.sku };
      Object.keys(p.sourceMap).forEach(k => {
        const info = p.sourceMap[k];
        s[k] = `[${info.status}] Conf: ${info.confidence} | Fonte: ${info.source}`;
      });
      return s;
    });
    generateExcelExport(data, sources, `export_${brandName || 'prodotti'}`);
  };

  return (
    <div className="space-y-6 flex flex-col h-full animate-in fade-in">
      <div className="flex justify-between items-center bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2">
            Monitor Pipeline Industriale
            {isProcessing && <Loader2 className="animate-spin text-indigo-500" size={20} />}
          </h3>
          <p className="text-sm text-gray-500">{currentTask}</p>
        </div>
        <div className="flex gap-2">
          {!isProcessing && (
            <button onClick={startProcessing} className="bg-indigo-600 text-white px-6 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700 font-bold shadow-lg">
              <Play size={18} /> Avvia
            </button>
          )}
          {progress > 0 && !isProcessing && (
            <button 
              onClick={handleExport} 
              className={`${hasBlockingErrors() ? 'bg-gray-400' : 'bg-emerald-600 hover:bg-emerald-700'} text-white px-6 py-2 rounded-lg flex items-center gap-2 font-bold shadow-md transition-colors`}
            >
              <Download size={18} /> Scarica Excel {hasBlockingErrors() && '(Bloccato)'}
            </button>
          )}
        </div>
      </div>

      <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
        <div className={`h-full transition-all duration-500 ${progress === 100 ? 'bg-emerald-500' : 'bg-indigo-600'}`} style={{ width: `${progress}%` }} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex-grow">
        <div className="overflow-y-auto max-h-[500px]">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] font-bold border-b sticky top-0 z-10">
              <tr>
                <th className="px-6 py-4 w-16 text-center">Stato</th>
                <th className="px-6 py-4">SKU</th>
                <th className="px-6 py-4 text-center">Audit</th>
                <th className="px-6 py-4">Status Elaborazione</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p, idx) => {
                // Fix: Explicitly cast to SourceInfo[] to fix 'unknown' type error for isBlocked check
                const isBlocked = (Object.values(p.sourceMap) as SourceInfo[]).some(a => a.warnings?.some(w => w.action === 'block_export'));
                return (
                  <tr key={idx} className={`border-t hover:bg-slate-50 ${isBlocked ? 'bg-red-50/20' : ''}`}>
                    <td className="px-6 py-4 text-center">
                      {p.status === 'processing' ? <Loader2 className="animate-spin text-indigo-500 mx-auto" size={18} /> : 
                       p.status === 'completed' ? (isBlocked ? <AlertTriangle className="text-amber-500 mx-auto" size={18} /> : <Check className="text-emerald-500 mx-auto" size={18} />) : 
                       p.status === 'error' ? <X className="text-red-500 mx-auto" size={18} /> : <Bookmark className="text-gray-300 mx-auto" size={18} />}
                    </td>
                    <td className="px-6 py-4 font-mono font-bold text-slate-800">{p.sku}</td>
                    <td className="px-6 py-4 text-center">
                      <button onClick={() => setSelectedLogProduct(p)} className="p-2 hover:bg-indigo-50 rounded-full text-indigo-600 inline-block transition-colors">
                        <ScrollText size={18} />
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      {isBlocked && <span className="text-red-600 font-bold text-[10px] uppercase flex items-center gap-1"><AlertCircle size={10} /> Validazione Fallita</span>}
                      {p.status === 'completed' && !isBlocked && <span className="text-emerald-600 font-bold text-[10px] uppercase">Pronto</span>}
                      {p.status === 'processing' && <span className="text-indigo-600 animate-pulse font-bold text-[10px] uppercase">In Corso...</span>}
                      {p.status === 'error' && <span className="text-red-600 text-[10px]">{p.error}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`bg-slate-900 rounded-xl overflow-hidden border border-slate-700 transition-all ${showTerminal ? 'h-64' : 'h-10'}`}>
        <div className="bg-slate-800 px-4 py-2 flex justify-between items-center cursor-pointer" onClick={() => setShowTerminal(!showTerminal)}>
          <span className="text-slate-300 font-mono text-xs flex items-center gap-2"><Terminal size={14} /> CONSOLE LOG SERVER</span>
          {showTerminal ? <ChevronDown size={14} className="text-slate-500"/> : <ChevronUp size={14} className="text-slate-500"/>}
        </div>
        <div ref={terminalRef} className="p-4 font-mono text-[10px] overflow-y-auto h-52 text-slate-300 space-y-1">
          {logs.map((log, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-slate-500 shrink-0">[{log.timestamp}]</span>
              <span className={log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-emerald-400' : log.type === 'ai' ? 'text-indigo-300 italic' : ''}>{log.message}</span>
            </div>
          ))}
        </div>
      </div>

      {selectedLogProduct && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="p-6 border-b flex justify-between items-center">
              <h4 className="font-bold text-lg">Dettagli Audit: {selectedLogProduct.sku}</h4>
              <button onClick={() => setSelectedLogProduct(null)} className="p-2 hover:bg-slate-100 rounded-full"><X /></button>
            </div>
            <div className="flex-grow overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {schema.map(field => {
                  const info = selectedLogProduct.sourceMap[field.name];
                  const value = selectedLogProduct.data[field.name];
                  const hasError = info?.warnings?.some(w => w.severity === 'error');
                  return (
                    <div key={field.id} className={`p-4 border rounded-2xl ${hasError ? 'border-red-200 bg-red-50/10' : 'bg-white'}`}>
                      <div className="text-[9px] font-black text-gray-400 mb-1 uppercase tracking-widest flex justify-between">
                        {field.name}
                        {info?.status === 'LOCKED' && <Lock size={10} className="text-indigo-500"/>}
                        {info?.status === 'STRICT' && <ShieldCheck size={10} className="text-emerald-500"/>}
                      </div>
                      <div className="text-sm font-bold text-slate-800 mb-2">{value || '---'}</div>
                      {info && (
                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-[8px]">
                            <span className="text-gray-500">{info.source}</span>
                            <span className={`px-1 rounded ${info.confidence === 'high' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{info.confidence}</span>
                          </div>
                          {info.warnings?.map((w, wi) => (
                            <div key={wi} className={`text-[8px] p-1 rounded font-bold ${w.severity === 'error' ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-800'}`}>
                              {w.message}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProcessingView;
