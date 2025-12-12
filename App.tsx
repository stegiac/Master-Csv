
import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx'; 
import { Layout, Database, FileInput, Settings, PlayCircle } from 'lucide-react';

import { AppSettings, UploadedFile, SchemaField, FileType, ColumnMapping, DataSourceType } from './types';
import { DEFAULT_SCHEMA, DEFAULT_TRUSTED_DOMAINS } from './constants';

import FileImportTab from './components/FileImportTab';
import SchemaTab from './components/SchemaTab';
import SettingsTab from './components/SettingsTab';
import ProcessingView from './components/ProcessingView';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'import' | 'schema' | 'settings' | 'process'>('import');
  
  const [files, setFiles] = useState<UploadedFile[]>([]);
  
  // --- PERSISTENCE LAYER ---

  // 1. Schema Persistence
  const [schema, setSchema] = useState<SchemaField[]>(() => {
    try {
      const saved = localStorage.getItem('ecom_ai_schema');
      return saved ? JSON.parse(saved) : DEFAULT_SCHEMA;
    } catch (e) { return DEFAULT_SCHEMA; }
  });

  useEffect(() => {
    localStorage.setItem('ecom_ai_schema', JSON.stringify(schema));
  }, [schema]);

  // 2. Settings Persistence (Trusted Domains, Priorities)
  const [settings, setSettings] = useState<AppSettings>(() => {
    const defaultPriority: DataSourceType[] = ['MAPPING', 'MANUFACTURER', 'PDF', 'WEB', 'IMAGE'];
    try {
      const saved = localStorage.getItem('ecom_ai_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Migration/Fallback if dataPriority is missing
        if (!parsed.dataPriority) {
          parsed.dataPriority = defaultPriority;
        }
        return parsed;
      }
      return {
        trustedDomains: DEFAULT_TRUSTED_DOMAINS,
        dataPriority: defaultPriority
      };
    } catch(e) {
      return {
        trustedDomains: DEFAULT_TRUSTED_DOMAINS,
        dataPriority: defaultPriority
      };
    }
  });

  useEffect(() => {
    localStorage.setItem('ecom_ai_settings', JSON.stringify(settings));
  }, [settings]);

  // 3. Mapping Persistence (Manufacturer Columns -> Schema Fields)
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>(() => {
    try {
      const saved = localStorage.getItem('ecom_ai_mapping');
      return saved ? JSON.parse(saved) : {};
    } catch(e) { return {}; }
  });

  useEffect(() => {
    localStorage.setItem('ecom_ai_mapping', JSON.stringify(columnMapping));
  }, [columnMapping]);

  // --- END PERSISTENCE LAYER ---

  const [brandName, setBrandName] = useState<string>('');
  
  // Base File Column Mappings (Session State)
  const [baseImageColumn, setBaseImageColumn] = useState<string>('');
  const [baseSkuColumn, setBaseSkuColumn] = useState<string>('');
  const [baseEanColumn, setBaseEanColumn] = useState<string>('');

  // Manufacturer File Column Mappings (Session State)
  const [manuSkuColumn, setManuSkuColumn] = useState<string>('');
  const [manuEanColumn, setManuEanColumn] = useState<string>('');
  const [manuDescColumn, setManuDescColumn] = useState<string>(''); // NEW: Description Source Column

  const handleFileAdd = (file: UploadedFile) => {
    setFiles(prev => {
      // If PDF, append. If Base or Manu, replace existing of that type.
      if (file.type === FileType.PDF) {
        return [...prev, file];
      } else {
        return [...prev.filter(f => f.type !== file.type), file];
      }
    });
  };

  const handleFileRemove = (id: string) => {
    const fileToRemove = files.find(f => f.id === id);
    setFiles(prev => prev.filter(f => f.id !== id));
    
    if (fileToRemove?.type === FileType.BASE) {
      setBaseImageColumn('');
      setBaseSkuColumn('');
      setBaseEanColumn('');
    }
    if (fileToRemove?.type === FileType.MANUFACTURER) {
      setManuSkuColumn('');
      setManuEanColumn('');
      setManuDescColumn('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <Database className="text-white w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">E-Com Import AI Master</h1>
          </div>
          <div className="text-sm text-gray-500">
            Powered by Gemini 2.5 Flash
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* Sidebar Navigation */}
          <nav className="w-full lg:w-64 flex-shrink-0 space-y-2">
            <button
              onClick={() => setActiveTab('import')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                activeTab === 'import' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-gray-200' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <FileInput size={20} /> Importazione Dati
            </button>
            <button
              onClick={() => setActiveTab('schema')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                activeTab === 'schema' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-gray-200' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Layout size={20} /> Schema Export
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                activeTab === 'settings' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-gray-200' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Settings size={20} /> Priorità Fonti
            </button>
             <div className="pt-4 border-t border-gray-200 mt-4">
              <button
                onClick={() => setActiveTab('process')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                  activeTab === 'process' ? 'bg-indigo-600 text-white shadow-md hover:bg-indigo-700' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <PlayCircle size={20} /> Elaborazione
              </button>
            </div>
          </nav>

          {/* Content Area */}
          <div className="flex-1 min-w-0">
            {activeTab === 'import' && (
              <FileImportTab 
                files={files} 
                onFileAdd={handleFileAdd} 
                onFileRemove={handleFileRemove}
                brandName={brandName}
                setBrandName={setBrandName}
                settings={settings}
                setSettings={setSettings}
                // Base File Props
                baseImageColumn={baseImageColumn}
                setBaseImageColumn={setBaseImageColumn}
                baseSkuColumn={baseSkuColumn}
                setBaseSkuColumn={setBaseSkuColumn}
                baseEanColumn={baseEanColumn}
                setBaseEanColumn={setBaseEanColumn}
                // Manufacturer File Props
                manuSkuColumn={manuSkuColumn}
                setManuSkuColumn={setManuSkuColumn}
                manuEanColumn={manuEanColumn}
                setManuEanColumn={setManuEanColumn}
                manuDescColumn={manuDescColumn}
                setManuDescColumn={setManuDescColumn}
                // Mapping
                schema={schema}
                columnMapping={columnMapping}
                setColumnMapping={setColumnMapping}
              />
            )}
            {activeTab === 'schema' && (
              <SchemaTab schema={schema} setSchema={setSchema} />
            )}
            {activeTab === 'settings' && (
              <SettingsTab settings={settings} setSettings={setSettings} />
            )}
            {activeTab === 'process' && (
              <ProcessingView 
                files={files} 
                schema={schema} 
                settings={settings}
                brandName={brandName}
                baseImageColumn={baseImageColumn}
                baseSkuColumn={baseSkuColumn}
                baseEanColumn={baseEanColumn}
                manuSkuColumn={manuSkuColumn}
                manuEanColumn={manuEanColumn}
                manuDescColumn={manuDescColumn}
                columnMapping={columnMapping}
              />
            )}
          </div>
        </div>
      </main>
      
      <script src="https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js"></script>
    </div>
  );
};

export default App;
