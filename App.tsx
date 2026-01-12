
import React, { useState, useEffect } from 'react';
import { Layout, Database, FileInput, Settings, PlayCircle, Activity, AlertCircle } from 'lucide-react';
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
  
  // Persistence
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
      return saved ? JSON.parse(saved) : { trustedDomains: DEFAULT_TRUSTED_DOMAINS, dataPriority: defaultPriority };
    } catch(e) { return { trustedDomains: DEFAULT_TRUSTED_DOMAINS, dataPriority: defaultPriority }; }
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
    const interval = setInterval(verify, 30000);
    return () => clearInterval(interval);
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
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg"><Database className="text-white w-6 h-6" /></div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">E-Com Import AI Master</h1>
          </div>
          <div className="flex items-center gap-4">
            {apiStatus && (
              <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${apiStatus.online ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                {apiStatus.online ? <Activity size={12} /> : <AlertCircle size={12} />}
                {apiStatus.online ? (apiStatus.error ? apiStatus.error : 'API Online') : 'API Offline'}
              </div>
            )}
            <div className="text-sm text-gray-500 hidden sm:block">Gemini 3 Pro</div>
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <div className="flex flex-col lg:flex-row gap-8">
          <nav className="w-full lg:w-64 flex-shrink-0 space-y-2">
            <button onClick={() => setActiveTab('import')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'import' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-gray-200' : 'text-gray-600 hover:bg-gray-100'}`}><FileInput size={20} /> Importazione Dati</button>
            <button onClick={() => setActiveTab('schema')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'schema' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-gray-200' : 'text-gray-600 hover:bg-gray-100'}`}><Layout size={20} /> Schema Export</button>
            <button onClick={() => setActiveTab('settings')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'settings' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-gray-200' : 'text-gray-600 hover:bg-gray-100'}`}><Settings size={20} /> Priorità Fonti</button>
            <div className="pt-4 border-t border-gray-200 mt-4">
              <button onClick={() => setActiveTab('process')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'process' ? 'bg-indigo-600 text-white shadow-md hover:bg-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}><PlayCircle size={20} /> Elaborazione</button>
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
    </div>
  );
};

export default App;
