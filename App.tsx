
import React, { useState, useEffect } from 'react';
import { Layout, Database, FileInput, Settings, PlayCircle, Activity, AlertCircle, CloudLightning, ShieldCheck } from 'lucide-react';
import { AppSettings, UploadedFile, SchemaField, FileType, ColumnMapping, DataSourceType } from './types';
import { DEFAULT_SCHEMA, DEFAULT_TRUSTED_DOMAINS } from './constants';
import FileImportTab from './components/FileImportTab';
import SchemaTab from './components/SchemaTab';
import SettingsTab from './components/SettingsTab';
import ProcessingView from './components/ProcessingView';
import { checkApiHealth } from './services/geminiService';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'import' | 'schema' | 'settings' | 'process'>('import');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [apiStatus, setApiStatus] = useState<{online: boolean, error?: string} | null>(null);
  
  const [schema, setSchema] = useState<SchemaField[]>(() => {
    try {
      const saved = localStorage.getItem('ecom_ai_schema');
      return saved ? JSON.parse(saved) : DEFAULT_SCHEMA;
    } catch (e) { return DEFAULT_SCHEMA; }
  });

  const [settings, setSettings] = useState<AppSettings>(() => {
    const defaultPriority: DataSourceType[] = ['MAPPING', 'MANUFACTURER', 'PDF', 'WEB', 'IMAGE'];
    try {
      const saved = localStorage.getItem('ecom_ai_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...parsed, disabledSources: parsed.disabledSources || [] };
      }
      return { trustedDomains: DEFAULT_TRUSTED_DOMAINS, dataPriority: defaultPriority, disabledSources: [], pipelineVersion: "2.1.0" };
    } catch(e) { return { trustedDomains: DEFAULT_TRUSTED_DOMAINS, dataPriority: defaultPriority, disabledSources: [], pipelineVersion: "2.1.0" }; }
  });

  const [columnMapping, setColumnMapping] = useState<ColumnMapping>(() => {
    try {
      const saved = localStorage.getItem('ecom_ai_mapping');
      return saved ? JSON.parse(saved) : {};
    } catch(e) { return {}; }
  });

  useEffect(() => {
    localStorage.setItem('ecom_ai_schema', JSON.stringify(schema));
    localStorage.setItem('ecom_ai_settings', JSON.stringify(settings));
    localStorage.setItem('ecom_ai_mapping', JSON.stringify(columnMapping));
  }, [schema, settings, columnMapping]);

  useEffect(() => {
    const verify = async () => {
      const status = await checkApiHealth();
      setApiStatus(status);
    };
    verify();
  }, []);

  const [brandName, setBrandName] = useState<string>('');
  const [baseImageColumn, setBaseImageColumn] = useState<string>('');
  const [baseSkuColumn, setBaseSkuColumn] = useState<string>('');
  const [baseEanColumn, setBaseEanColumn] = useState<string>('');
  const [manuSkuColumn, setManuSkuColumn] = useState<string>('');
  const [manuEanColumn, setManuEanColumn] = useState<string>('');
  const [manuDescColumn, setManuDescColumn] = useState<string>('');

  const handleFileAdd = (file: UploadedFile) => {
    setFiles(prev => (file.type === FileType.PDF ? [...prev, file] : [...prev.filter(f => f.type !== file.type), file]));
  };

  const handleFileRemove = (id: string) => {
    const fileToRemove = files.find(f => f.id === id);
    setFiles(prev => prev.filter(f => f.id !== id));
    if (fileToRemove?.type === FileType.BASE) { setBaseImageColumn(''); setBaseSkuColumn(''); setBaseEanColumn(''); }
    if (fileToRemove?.type === FileType.MANUFACTURER) { setManuSkuColumn(''); setManuEanColumn(''); setManuDescColumn(''); }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg shadow-indigo-200 shadow-md">
              <Database className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight leading-none">E-Com Import AI Master</h1>
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-tighter">Pure Static Engine</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {apiStatus && (
              <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
                apiStatus.online 
                  ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                  : 'bg-red-50 text-red-600 border-red-100 animate-pulse'
              }`}>
                {apiStatus.online ? <CloudLightning size={12} /> : <AlertCircle size={12} />}
                {apiStatus.online ? 'AI PRONTA (Client)' : (apiStatus.error || 'ERRORE API KEY')}
              </div>
            )}
            <div className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded">V {settings.pipelineVersion}</div>
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {apiStatus?.error && (
          <div className="mb-6 bg-red-50 border-2 border-red-200 p-6 rounded-2xl shadow-sm flex items-start gap-4">
            <div className="bg-red-100 p-3 rounded-full text-red-600">
              <AlertCircle size={24} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-red-900 leading-tight">Problema di configurazione (Static Build)</h2>
              <p className="text-red-800 mt-1 text-sm">
                Il motore AI non può avviarsi perché la <strong>API_KEY</strong> non è stata rilevata durante la compilazione. 
                <br/>Se sei su Hostinger, assicurati che la variabile d'ambiente sia presente nelle impostazioni del "Build Command" o dei "Secrets".
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-8">
          <nav className="w-full lg:w-64 flex-shrink-0 space-y-2">
            <button onClick={() => setActiveTab('import')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'import' ? 'bg-indigo-600 text-white shadow-indigo-100 shadow-lg' : 'text-slate-600 hover:bg-white hover:shadow-sm'}`}><FileInput size={20} /> Importazione</button>
            <button onClick={() => setActiveTab('schema')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'schema' ? 'bg-indigo-600 text-white shadow-indigo-100 shadow-lg' : 'text-slate-600 hover:bg-white hover:shadow-sm'}`}><Layout size={20} /> Schema Export</button>
            <button onClick={() => setActiveTab('settings')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'settings' ? 'bg-indigo-600 text-white shadow-indigo-100 shadow-lg' : 'text-slate-600 hover:bg-white hover:shadow-sm'}`}><Settings size={20} /> Priorità Fonti</button>
            <div className="pt-4 border-t border-slate-200 mt-4">
              <button 
                onClick={() => setActiveTab('process')} 
                disabled={!apiStatus?.online}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-black transition-all ${
                  !apiStatus?.online ? 'bg-gray-200 text-gray-400 cursor-not-allowed' :
                  activeTab === 'process' ? 'bg-emerald-600 text-white shadow-emerald-100 shadow-lg' : 'bg-white text-slate-900 shadow-sm border border-slate-200 hover:border-emerald-300'
                }`}
              >
                <PlayCircle size={20} /> AVVIA MOTORE AI
              </button>
            </div>
          </nav>

          <div className="flex-1 min-w-0">
            {activeTab === 'import' && (
              <FileImportTab files={files} onFileAdd={handleFileAdd} onFileRemove={handleFileRemove} brandName={brandName} setBrandName={setBrandName} settings={settings} setSettings={setSettings} baseImageColumn={baseImageColumn} setBaseImageColumn={setBaseImageColumn} baseSkuColumn={baseSkuColumn} setBaseSkuColumn={setBaseSkuColumn} baseEanColumn={baseEanColumn} setBaseEanColumn={setBaseEanColumn} manuSkuColumn={manuSkuColumn} setManuSkuColumn={setManuSkuColumn} manuEanColumn={manuEanColumn} setManuEanColumn={setManuEanColumn} manuDescColumn={manuDescColumn} setManuDescColumn={setManuDescColumn} schema={schema} columnMapping={columnMapping} setColumnMapping={setColumnMapping} />
            )}
            {activeTab === 'schema' && <SchemaTab schema={schema} setSchema={setSchema} />}
            {activeTab === 'settings' && <SettingsTab settings={settings} setSettings={setSettings} />}
            {activeTab === 'process' && <ProcessingView files={files} schema={schema} settings={settings} brandName={brandName} baseImageColumn={baseImageColumn} baseSkuColumn={baseSkuColumn} baseEanColumn={baseEanColumn} manuSkuColumn={manuSkuColumn} manuEanColumn={manuEanColumn} manuDescColumn={manuDescColumn} columnMapping={columnMapping} />}
          </div>
        </div>
      </main>

      <footer className="bg-white border-t border-gray-100 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-2">
          <div className="text-[10px] text-gray-400 font-medium">
            MODALITÀ STATICA ATTIVA • I dati vengono elaborati localmente nel browser • Nessun backend intermedio
          </div>
          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-300 uppercase">
             <ShieldCheck size={12} /> Powered by Gemini Google SDK (Client-Side)
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
