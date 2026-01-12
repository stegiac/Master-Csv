
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
      addLog(`Pronti ${initial.length} SKU per l'elaborazione.`, 'info');
    }
  }, [baseFile, baseSkuColumn, baseEanColumn]);

  const hasBlockingErrors = () => {
    return products.some(p => 
      (Object.values(p.sourceMap) as SourceInfo[]).some(audit => 
        audit.warnings?.some(w => w.action === 'block_export')
      )
    );
  };

  const startProcessing = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    addLog("Avvio Motore AI Deep Context...", 'info');

    // Filtra le fonti disabilitate dalla priorità
    const activeDataPriority = settings.dataPriority.filter(
      source => !settings.disabledSources.includes(source)
    );
    
    addLog(`Fonti Attive: ${activeDataPriority.join(', ')}`, 'info');

    let currentParsed = [...parsedPdfs];
    if (pdfFiles.length > 0 && currentParsed.length === 0 && activeDataPriority.includes('PDF')) {
      setCurrentTask("Indicizzazione cataloghi PDF...");
      const indexed: ParsedPdf[] = [];
      for(let f of pdfFiles) {
        if (f.rawFile) {
          try {
            const parsed = await extractTextFromPdf(f.rawFile);
            indexed.push(parsed);
            addLog(`PDF Indicizzato: ${f.name}`, 'success');
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

      addLog(`Analisi SKU ${p.sku}...`, 'info');
      setCurrentTask(`Articolo ${i+1}/${total}: ${p.sku}`);
      
      setProducts(prev => {
        const next = [...prev];
        next[i] = { ...next[i], status: 'processing' };
        return next;
      });

      try {
        const pdfContext = activeDataPriority.includes('PDF') 
          ? findRelevantPdfContext(currentParsed, p.sku, p.ean)
          : { rawText: "" };

        const mappedValues: Record<string, any> = {};
        let manuData = null;

        if (manuFile && activeDataPriority.includes('MANUFACTURER')) {
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
          trustedDomains: settings.trustedDomains,
          dataPriority: activeDataPriority // Passiamo solo le fonti attive
        });

        setProducts(prev => {
          const next = [...prev];
          next[i] = { 
            ...next[i], 
            data: result.values, 
            sourceMap: result.audit, 
            status: 'completed' 
          };
          return next;
        });
        addLog(`SKU ${p.sku} processato con successo.`, 'success');

      } catch (e: any) {
        addLog(`ERRORE SKU ${p.sku}: ${e.message}`, 'error');
        setProducts(prev => {
          const next = [...prev];
          next[i] = { ...next[i], status: 'error', error: e.message };
          return next;
        });
        if (e.message.includes("401") || e.message.includes("TIMEOUT")) {
          addLog("Pipeline interrotta per errore critico.", 'error');
          break;
        }
      }

      completedCount++;
      setProgress(Math.round((completedCount / total) * 100));
      await new Promise(r => setTimeout(r, 100));
    }

    setIsProcessing(false);
    setCurrentTask("Elaborazione completata.");
  };

  const handleExport = () => {
    if (hasBlockingErrors()) {
      alert("IMPOSSIBILE ESPORTARE: Sono presenti errori bloccanti.");
      return;
    }
    const data = products.map(p => ({ SKU: p.sku, EAN: p.ean, ...p.data }));
    const sources = products.map(p => {
      const s: any = { SKU: p.sku };
      Object.keys(p.sourceMap).forEach(k => {
        const info = p.sourceMap[k] as SourceInfo;
        s[k] = `[${info.status}] Fonte: ${info.source} (${info.confidence})`;
      });
      return s;
    });
    generateExcelExport(data, sources, `export_${brandName || 'import'}`);
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
            <button onClick={startProcessing} className="bg-indigo-600 text-white px-6 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700 font-bold shadow-lg transition-all active:scale-95">
              <Play size={18} /> Avvia Analisi
            </button>
          )}
          {progress > 0 && !isProcessing && (
            <button 
              onClick={handleExport} 
              className={`${hasBlockingErrors() ? 'bg-gray-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 shadow-lg'} text-white px-6 py-2 rounded-lg flex items-center gap-2 font-bold transition-all`}
            >
              <Download size={18} /> Scarica Excel {hasBlockingErrors() && '(Bloccato)'}
            </button>
          )}
        </div>
      </div>

      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden shadow-inner">
        <div className={`h-full transition-all duration-700 ease-out ${progress === 100 ? 'bg-emerald-500' : 'bg-indigo-600'}`} style={{ width: `${progress}%` }} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex-grow">
        <div className="overflow-y-auto max-h-[500px]">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b sticky top-0 z-10">
              <tr>
                <th className="px-6 py-4 w-16 text-center">Stato</th>
                <th className="px-6 py-4">SKU / Prodotto</th>
                <th className="px-6 py-4 text-center">Audit</th>
                <th className="px-6 py-4">Dettagli Elaborazione</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p, idx) => {
                const audits = Object.values(p.sourceMap) as SourceInfo[];
                const isBlocked = audits.some(a => a.warnings?.some(w => w.action === 'block_export'));
                return (
                  <tr key={idx} className={`border-t hover:bg-slate-50 transition-colors ${isBlocked ? 'bg-red-50/30' : ''}`}>
                    <td className="px-6 py-4 text-center">
                      {p.status === 'processing' ? <Loader2 className="animate-spin text-indigo-500 mx-auto" size={18} /> : 
                       p.status === 'completed' ? (isBlocked ? <AlertTriangle className="text-amber-500 mx-auto" size={18} /> : <Check className="text-emerald-500 mx-auto" size={18} />) : 
                       p.status === 'error' ? <X className="text-red-500 mx-auto" size={18} /> : <Bookmark className="text-gray-300 mx-auto" size={18} />}
                    </td>
                    <td className="px-6 py-4 font-mono font-bold text-slate-800">
                      {p.sku}
                      <div className="text-[10px] font-normal text-slate-400">{p.ean}</div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button onClick={() => setSelectedLogProduct(p)} className="p-2 hover:bg-indigo-50 rounded-full text-indigo-600 transition-colors border border-transparent hover:border-indigo-100">
                        <ScrollText size={18} />
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      {isBlocked && <span className="text-red-600 font-bold text-[10px] uppercase flex items-center gap-1"><AlertCircle size={10} /> Validazione Fallita</span>}
                      {p.status === 'completed' && !isBlocked && <span className="text-emerald-600 font-bold text-[10px] uppercase">Dati Validati</span>}
                      {p.status === 'processing' && <span className="text-indigo-600 animate-pulse font-bold text-[10px] uppercase flex items-center gap-2"><Zap size={10}/> Interrogazione AI + Search...</span>}
                      {p.status === 'error' && <span className="text-red-600 text-[10px] font-medium">{p.error}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`bg-slate-900 rounded-xl overflow-hidden border border-slate-700 shadow-xl transition-all ${showTerminal ? 'h-64' : 'h-10'}`}>
        <div className="bg-slate-800 px-4 py-2 flex justify-between items-center cursor-pointer select-none" onClick={() => setShowTerminal(!showTerminal)}>
          <span className="text-slate-300 font-mono text-[10px] flex items-center gap-2 font-bold tracking-widest"><Terminal size={14} className="text-indigo-400" /> CONSOLE DIAGNOSTICA SERVER</span>
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            {showTerminal ? <ChevronDown size={14} className="text-slate-500"/> : <ChevronUp size={14} className="text-slate-500"/>}
          </div>
        </div>
        <div ref={terminalRef} className="p-4 font-mono text-[10px] overflow-y-auto h-52 text-slate-300 space-y-1">
          {logs.map((log, i) => (
            <div key={i} className="flex gap-2 border-b border-slate-800/50 pb-1">
              <span className="text-slate-500 shrink-0">[{log.timestamp}]</span>
              <span className={log.type === 'error' ? 'text-red-400 font-bold' : log.type === 'success' ? 'text-emerald-400' : log.type === 'ai' ? 'text-indigo-300 italic' : ''}>{log.message}</span>
            </div>
          ))}
          {logs.length === 0 && <div className="text-slate-600 italic">In attesa di attività...</div>}
        </div>
      </div>

      {selectedLogProduct && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-50 p-4 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-slate-200">
            <div className="p-6 border-b flex justify-between items-center bg-slate-50">
              <div>
                <h4 className="font-bold text-xl text-slate-900 flex items-center gap-2">
                  Dettagli Audit: {selectedLogProduct.sku}
                  <span className="text-[10px] font-normal bg-slate-200 px-2 py-0.5 rounded text-slate-600">{selectedLogProduct.ean}</span>
                </h4>
                <p className="text-xs text-slate-500 mt-1">Verifica delle fonti e validazione tecnica dei campi esportati.</p>
              </div>
              <button onClick={() => setSelectedLogProduct(null)} className="p-3 hover:bg-red-50 hover:text-red-500 rounded-full transition-all"><X /></button>
            </div>
            <div className="flex-grow overflow-y-auto p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {schema.map(field => {
                  const info = selectedLogProduct.sourceMap[field.name] as SourceInfo;
                  const value = selectedLogProduct.data[field.name];
                  const hasBlockingError = info?.warnings?.some(w => w.action === 'block_export');
                  const hasWarn = info?.warnings?.some(w => w.severity === 'warn');
                  
                  return (
                    <div key={field.id} className={`p-5 border-2 rounded-2xl transition-all ${
                      hasBlockingError ? 'border-red-200 bg-red-50/20 shadow-red-100 shadow-sm' : 
                      hasWarn ? 'border-amber-200 bg-amber-50/20' : 
                      'border-slate-100 bg-white hover:border-indigo-100'
                    }`}>
                      <div className="text-[9px] font-black text-slate-400 mb-2 uppercase tracking-widest flex justify-between items-center">
                        <span className="flex items-center gap-1">
                           {field.name}
                           {field.fieldClass === 'HARD' && <span className="text-red-400">*</span>}
                        </span>
                        {info?.status === 'LOCKED' && <Lock size={12} className="text-indigo-500" title="Dato Certificato Excel"/>}
                        {info?.status === 'STRICT' && <ShieldCheck size={12} className="text-emerald-500" title="Dato Verificato PDF"/>}
                        {info?.status === 'EMPTY' && <AlertCircle size={12} className="text-red-500" title="Dato Mancante"/>}
                      </div>
                      <div className="text-sm font-bold text-slate-800 mb-3 bg-slate-50/50 p-2 rounded-lg border border-slate-100/50 min-h-[40px] flex items-center">
                        {value || <span className="text-slate-300 italic">Mancante</span>}
                      </div>
                      {info && (
                        <div className="space-y-2">
                          <div className="flex justify-between items-center text-[9px] border-b border-slate-100 pb-1">
                            <span className="text-slate-500 font-medium truncate max-w-[120px]" title={info.source}>{info.source}</span>
                            <span className={`px-2 py-0.5 rounded font-bold uppercase ${
                              info.confidence === 'high' ? 'bg-emerald-100 text-emerald-700' : 
                              info.confidence === 'medium' ? 'bg-indigo-100 text-indigo-700' : 
                              'bg-slate-100 text-slate-600'
                            }`}>{info.confidence}</span>
                          </div>
                          {info.warnings?.map((w, wi) => (
                            <div key={wi} className={`text-[9px] p-2 rounded-lg font-bold flex items-start gap-2 ${
                              w.severity === 'error' ? 'bg-red-600 text-white shadow-md' : 'bg-amber-100 text-amber-800'
                            }`}>
                              <AlertCircle size={10} className="mt-0.5 shrink-0" />
                              <span>{w.message}</span>
                            </div>
                          ))}
                          {info.url && (
                            <a href={info.url} target="_blank" rel="noopener noreferrer" className="text-[9px] text-indigo-600 hover:underline flex items-center gap-1 font-bold">
                              <ExternalLink size={10} /> Vedi Fonte Web
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="p-6 bg-slate-50 border-t flex justify-end">
               <button onClick={() => setSelectedLogProduct(null)} className="px-8 py-2 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all">Chiudi Ispezione</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProcessingView;
