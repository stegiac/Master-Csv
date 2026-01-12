
import React, { useState, useEffect } from 'react';
import { Play, Download, Loader2, AlertTriangle, Check, ScrollText, X, Info, ShieldCheck, Search, Database, AlertCircle, Bookmark, Zap, ExternalLink } from 'lucide-react';
import { UploadedFile, SchemaField, FileType, ProcessedProduct, ColumnMapping, AppSettings, SourceInfo, Warning } from '../types';
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

  const baseFile = files.find(f => f.type === FileType.BASE);
  const manuFile = files.find(f => f.type === FileType.MANUFACTURER);
  const pdfFiles = files.filter(f => f.type === FileType.PDF);

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
    }
  }, [baseFile, baseSkuColumn, baseEanColumn]);

  const startProcessing = async () => {
    setIsProcessing(true);
    let currentParsed = [...parsedPdfs];

    if (pdfFiles.length > 0 && currentParsed.length === 0) {
      const indexed: ParsedPdf[] = [];
      for(let f of pdfFiles) if (f.rawFile) indexed.push(await extractTextFromPdf(f.rawFile));
      currentParsed = indexed;
      setParsedPdfs(indexed);
    }

    const newProducts = [...products];
    let completed = 0;

    for (let i = 0; i < newProducts.length; i++) {
      if (newProducts[i].status === 'completed') { completed++; continue; }
      const p = newProducts[i];
      p.status = 'processing';
      setProducts([...newProducts]);

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

        p.data = result.values;
        p.sourceMap = result.audit;
        p.rawResponse = result.rawResponse;
        p.status = 'completed';

      } catch (e: any) {
        p.status = 'error';
        p.error = e.message;
      }

      completed++;
      setProgress(Math.round((completed / newProducts.length) * 100));
      setProducts([...newProducts]);
      await new Promise(r => setTimeout(r, 800)); 
    }
    setIsProcessing(false);
  };

  const getConfidenceBadge = (confidence: string) => {
    const colors = {
      high: 'bg-green-100 text-green-700',
      medium: 'bg-yellow-100 text-yellow-700',
      low: 'bg-red-100 text-red-700'
    };
    return (
      <span className={`text-[8px] px-1.5 py-0.5 rounded-sm font-black uppercase ${(colors as any)[confidence] || colors.medium}`}>
        {confidence}
      </span>
    );
  };

  const handleExport = () => {
    const data = products.map(p => ({ SKU: p.sku, EAN: p.ean, ...p.data }));
    const sources = products.map(p => {
      const s: any = { SKU: p.sku };
      Object.keys(p.sourceMap).forEach(k => {
        const info = p.sourceMap[k];
        s[k] = `[${info.status}] Conf: ${info.confidence} | Fonte: ${info.source}`;
      });
      return s;
    });
    generateExcelExport(data, sources, `export_${brandName || 'products'}`);
  };

  // Fixed line 140: Added explicit type cast to SourceInfo[] to avoid 'unknown' type error in strict mode
  const hasBlockingErrors = products.some(p => 
    (Object.values(p.sourceMap) as SourceInfo[]).some(si => 
      si.warnings?.some(w => w.action === 'block_export')
    )
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <div>
          <h3 className="text-lg font-bold">Monitor Pipeline Industriale</h3>
          <p className="text-sm text-gray-500">Motore di Riconciliazione v{settings.pipelineVersion}</p>
        </div>
        <div className="flex gap-2">
          {!isProcessing && (
            <button onClick={startProcessing} className="bg-indigo-600 text-white px-6 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700 shadow-lg transition-all">
              <Play size={18} /> Avvia Pipeline
            </button>
          )}
          {progress > 0 && !isProcessing && (
            <div className="flex flex-col items-end gap-1">
               <button 
                 disabled={hasBlockingErrors}
                 onClick={handleExport} 
                 className={`px-6 py-2 rounded-lg flex items-center gap-2 transition-all ${
                   hasBlockingErrors ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md'
                 }`}
               >
                 <Download size={18} /> Export Finale
               </button>
               {hasBlockingErrors && <span className="text-[10px] text-red-500 font-bold uppercase tracking-wider">Export bloccato da errori gravi</span>}
            </div>
          )}
        </div>
      </div>

      <div className="w-full bg-gray-100 rounded-full h-2">
        <div className="bg-indigo-600 h-2 rounded-full transition-all duration-500 shadow-inner" style={{ width: `${progress}%` }}></div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] font-bold tracking-widest border-b">
            <tr>
              <th className="px-6 py-4 w-16">Stato</th>
              <th className="px-6 py-4">SKU / Prodotto</th>
              <th className="px-6 py-4">Audit & Alerts</th>
              <th className="px-6 py-4">Status Campi</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p, idx) => {
              const allSourceInfo = (Object.values(p.sourceMap) as SourceInfo[]);
              const errCount = allSourceInfo.reduce((acc, curr) => acc + (curr.warnings?.filter(w => w.severity === 'error').length || 0), 0);
              const warnCount = allSourceInfo.reduce((acc, curr) => acc + (curr.warnings?.filter(w => w.severity === 'warn').length || 0), 0);
              const isBlocking = allSourceInfo.some(si => si.warnings?.some(w => w.action === 'block_export'));
              
              return (
                <tr key={idx} className={`border-t hover:bg-slate-50/50 transition-colors ${isBlocking ? 'bg-red-50/30' : ''}`}>
                  <td className="px-6 py-4">
                    {p.status === 'processing' ? <Loader2 className="animate-spin text-indigo-500" size={18} /> : 
                     p.status === 'completed' ? <Check className="text-emerald-500" size={18} /> : 
                     p.status === 'error' ? <AlertTriangle className="text-red-500" size={18} /> : <Bookmark className="text-gray-300" size={18} />}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-mono font-bold text-slate-800">{p.sku}</div>
                    <div className="text-[10px] text-gray-400">{p.ean}</div>
                  </td>
                  <td className="px-6 py-4">
                    <button onClick={() => setSelectedLogProduct(p)} className="flex items-center gap-2 group">
                      <ScrollText size={16} className="text-indigo-400 group-hover:text-indigo-600" />
                      <span className="text-xs font-medium text-slate-600 group-hover:underline">Audit Trail</span>
                      <div className="flex gap-1">
                        {errCount > 0 && <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-0.5 ${isBlocking ? 'bg-red-600 text-white animate-pulse' : 'bg-red-100 text-red-600'}`}><AlertCircle size={8}/> {errCount}</span>}
                        {warnCount > 0 && <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-0.5"><AlertTriangle size={8}/> {warnCount}</span>}
                      </div>
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                       {allSourceInfo.slice(0, 4).map((info, ii) => (
                         <div key={ii} className={`w-2 h-2 rounded-full ${info.status === 'LOCKED' ? 'bg-indigo-500' : info.status === 'STRICT' ? 'bg-emerald-500' : 'bg-blue-400'}`} title={`${info.source} (${info.status})`} />
                       ))}
                       {allSourceInfo.length > 4 && <span className="text-[8px] text-gray-400">+{allSourceInfo.length - 4}</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedLogProduct && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-md">
                   <ShieldCheck size={24} />
                </div>
                <div>
                   <h4 className="font-bold text-lg text-slate-800 tracking-tight">Report SKU: {selectedLogProduct.sku}</h4>
                   <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Confidence Analysis & Reconciliation</p>
                </div>
              </div>
              <button onClick={() => setSelectedLogProduct(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X /></button>
            </div>
            
            <div className="flex-grow overflow-y-auto p-8 bg-white space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {schema.filter(f => f.enabled).map(field => {
                  const info = selectedLogProduct.sourceMap[field.name];
                  const value = selectedLogProduct.data[field.name];
                  if (!value && !info) return null;
                  
                  return (
                    <div key={field.id} className={`p-4 border rounded-2xl flex flex-col ${
                      info?.status === 'LOCKED' ? 'bg-indigo-50/10 border-indigo-100' : 
                      info?.warnings?.some(w => w.severity === 'error') ? 'bg-red-50/30 border-red-200' : 'bg-white border-slate-200'
                    } shadow-sm transition-all hover:shadow-md`}>
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex flex-col gap-1">
                           <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">{field.name}</span>
                           <div className="flex gap-1.5 items-center">
                              {info && getConfidenceBadge(info.confidence)}
                              <span className={`text-[8px] px-1 rounded uppercase font-bold border ${info?.status === 'LOCKED' ? 'border-indigo-200 text-indigo-600' : 'border-slate-200 text-slate-400'}`}>{info?.status}</span>
                           </div>
                        </div>
                        {info?.url && (
                          <a href={info.url} target="_blank" className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors" title="Apri fonte web">
                             <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                      
                      <div className="text-sm font-bold text-slate-800 mb-3">{value || <span className="text-slate-300 italic">Vuoto</span>}</div>
                      
                      {info && (
                        <div className="space-y-2 pt-3 border-t border-slate-100">
                          <div className="flex items-center gap-1.5 text-[9px] text-slate-500 font-bold">
                             {info.sourceType === 'DERIVED' ? <Zap size={10} className="text-amber-500" /> : <Database size={10} />}
                             <span>{info.source}</span>
                          </div>
                          
                          {info.warnings?.map((w, wi) => (
                            <div key={wi} className={`flex items-start gap-1.5 text-[9px] font-bold p-1.5 rounded ${
                               w.severity === 'error' ? 'bg-red-100 text-red-700' : 
                               w.severity === 'warn' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                            }`}>
                              {w.severity === 'error' ? <AlertCircle size={10} className="shrink-0" /> : <AlertTriangle size={10} className="shrink-0" />}
                              <span>{w.message}</span>
                            </div>
                          ))}

                          {info.evidence && (
                            <div className="text-[9px] p-2 bg-slate-50 rounded-lg text-slate-500 italic border border-slate-100">
                              "{info.evidence}"
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-8 border-t border-slate-100 pt-6">
                 <h5 className="text-xs font-black text-slate-400 uppercase mb-3 flex items-center gap-2 tracking-widest"><Info size={16} /> Raw AI Trace</h5>
                 <pre className="text-[10px] bg-slate-900 text-emerald-400 p-6 rounded-2xl overflow-x-auto whitespace-pre-wrap font-mono border border-slate-800 shadow-inner">
                   {selectedLogProduct.rawResponse || "Dati deterministici (No AI Trace)."}
                 </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProcessingView;
