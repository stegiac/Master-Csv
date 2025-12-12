
import React, { useState } from 'react';
import { Upload, FileSpreadsheet, FileText, CheckCircle, Trash2, Globe, X, Building2, Link as LinkIcon, List, ArrowRight, Settings2, RotateCcw, Barcode, Hash, FileStack, AlignLeft } from 'lucide-react';
import { FileType, UploadedFile, AppSettings, SchemaField, ColumnMapping } from '../types';
import { readExcelFile } from '../services/excelService';

interface Props {
  files: UploadedFile[];
  onFileAdd: (file: UploadedFile) => void;
  onFileRemove: (id: string) => void;
  brandName: string;
  setBrandName: (name: string) => void;
  settings: AppSettings;
  setSettings: (settings: AppSettings) => void;
  
  // Base File Mapping
  baseImageColumn: string;
  setBaseImageColumn: (col: string) => void;
  baseSkuColumn: string;
  setBaseSkuColumn: (col: string) => void;
  baseEanColumn: string;
  setBaseEanColumn: (col: string) => void;

  // Manufacturer File Mapping
  manuSkuColumn: string;
  setManuSkuColumn: (col: string) => void;
  manuEanColumn: string;
  setManuEanColumn: (col: string) => void;
  manuDescColumn: string;
  setManuDescColumn: (col: string) => void;

  // Manufacturer Schema Mapping
  schema: SchemaField[];
  columnMapping: ColumnMapping;
  setColumnMapping: (mapping: ColumnMapping) => void;
}

const FileImportTab: React.FC<Props> = ({ 
  files, 
  onFileAdd, 
  onFileRemove, 
  brandName, 
  setBrandName,
  settings,
  setSettings,
  baseImageColumn,
  setBaseImageColumn,
  baseSkuColumn,
  setBaseSkuColumn,
  baseEanColumn,
  setBaseEanColumn,
  manuSkuColumn,
  setManuSkuColumn,
  manuEanColumn,
  setManuEanColumn,
  manuDescColumn,
  setManuDescColumn,
  schema,
  columnMapping,
  setColumnMapping
}) => {
  const [newDomain, setNewDomain] = useState('');
  const [showMapping, setShowMapping] = useState(false);

  const baseFile = files.find(f => f.type === FileType.BASE);
  const manuFile = files.find(f => f.type === FileType.MANUFACTURER);
  const pdfFiles = files.filter(f => f.type === FileType.PDF);

  const detectColumns = (headers: string[], type: FileType) => {
     // SKU Detection
     const skuCol = headers.find(h => h.toLowerCase().includes('sku') || h.toLowerCase().includes('codice') || h.toLowerCase().includes('art'));
     if (skuCol) {
       if (type === FileType.BASE) setBaseSkuColumn(skuCol);
       if (type === FileType.MANUFACTURER) setManuSkuColumn(skuCol);
     }

     // EAN Detection
     const eanCol = headers.find(h => h.toLowerCase().includes('ean') || h.toLowerCase().includes('barcode'));
     if (eanCol) {
       if (type === FileType.BASE) setBaseEanColumn(eanCol);
       if (type === FileType.MANUFACTURER) setManuEanColumn(eanCol);
     }

     // Image Detection (Base Only)
     if (type === FileType.BASE) {
      const imgCol = headers.find(h => h.toLowerCase().includes('foto') || h.toLowerCase().includes('img') || h.toLowerCase().includes('image') || h.toLowerCase().includes('url'));
      if (imgCol) setBaseImageColumn(imgCol);
     }

     // Description Detection (Manufacturer Only)
     if (type === FileType.MANUFACTURER) {
       const descCol = headers.find(h => h.toLowerCase().includes('desc') || h.toLowerCase().includes('nome') || h.toLowerCase().includes('prodotto'));
       if (descCol) setManuDescColumn(descCol);
     }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: FileType) => {
    if (e.target.files && e.target.files.length > 0) {
      
      // Convert FileList to Array
      const uploadedFiles = Array.from(e.target.files) as File[];

      for (const file of uploadedFiles) {
        let parsedData: any[] = [];
        
        // Parse if Excel/CSV, keep raw if PDF
        if (type !== FileType.PDF) {
          try {
            parsedData = await readExcelFile(file);
          } catch (err) {
            alert(`Errore nella lettura del file ${file.name}`);
            continue;
          }
        }

        // Auto-detect columns for first file if not set
        if (type !== FileType.PDF && parsedData.length > 0) {
          const headers = Object.keys(parsedData[0]);
          detectColumns(headers, type);
        }

        onFileAdd({
          id: Date.now().toString() + Math.random().toString(),
          type,
          name: file.name,
          data: parsedData,
          rawFile: file
        });
      }
    }
  };

  const addDomain = () => {
    if (newDomain && !settings.trustedDomains.includes(newDomain)) {
      setSettings({
        ...settings,
        trustedDomains: [...settings.trustedDomains, newDomain]
      });
      setNewDomain('');
    }
  };

  const removeDomain = (domain: string) => {
    setSettings({
      ...settings,
      trustedDomains: settings.trustedDomains.filter(d => d !== domain)
    });
  };

  // Mapping Helpers
  const getMappedSchemaId = (colName: string) => {
    // Find which schema field ID maps to this column name
    return Object.keys(columnMapping).find(key => columnMapping[key] === colName) || '';
  };

  const handleMappingChange = (colName: string, schemaId: string) => {
    const newMapping = { ...columnMapping };

    // 1. Remove any existing mapping for this specific column (if it was mapped to something else)
    const oldSchemaId = Object.keys(newMapping).find(key => newMapping[key] === colName);
    if (oldSchemaId) {
      delete newMapping[oldSchemaId];
    }

    // 2. If a valid schema ID is selected
    if (schemaId) {
      // Assign the new mapping. 
      newMapping[schemaId] = colName;
    }

    setColumnMapping(newMapping);
  };

  const handleClearMapping = () => {
    if (confirm("Vuoi cancellare tutta la mappatura corrente?")) {
      setColumnMapping({});
    }
  };

  const getFileStatusCard = (file: UploadedFile) => (
    <div key={file.id} className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg mb-2">
      <div className="flex items-center gap-3">
        <CheckCircle className="text-green-600 w-5 h-5" />
        <div>
          <p className="font-medium text-green-900 truncate max-w-[180px] text-sm">{file.name}</p>
          <p className="text-[10px] text-green-700">
            {file.type === FileType.PDF ? 'PDF Caricato' : `${file.data.length} righe`}
          </p>
        </div>
      </div>
      <button onClick={() => onFileRemove(file.id)} className="text-red-500 hover:bg-red-100 p-1.5 rounded">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );

  const baseHeaders = baseFile?.data.length ? Object.keys(baseFile.data[0]) : [];
  const manuHeaders = manuFile?.data.length ? Object.keys(manuFile.data[0]) : [];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Brand Input Section */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center gap-2 mb-4">
          <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
            <Building2 size={24} />
          </div>
          <div>
            <h3 className="font-bold text-lg text-gray-800">Brand / Produttore</h3>
            <p className="text-sm text-gray-500">Il nome del brand verrà usato per migliorare la precisione della ricerca web.</p>
          </div>
        </div>
        <input 
          type="text" 
          placeholder="Es. Philips, Osram, Artemide..." 
          value={brandName}
          onChange={(e) => setBrandName(e.target.value)}
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-lg"
        />
      </div>

      {/* Trusted Domains Section */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center gap-2 mb-4">
          <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
            <Globe size={24} />
          </div>
          <div>
            <h3 className="font-bold text-lg text-gray-800">Domini Affidabili</h3>
            <p className="text-sm text-gray-500">L'AI cercherà prioritariamente informazioni in questi siti web.</p>
          </div>
        </div>
        
        <div className="flex gap-2 mb-4">
          <input 
            type="text" 
            placeholder="es. unieuro.it" 
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            className="flex-grow p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
            onKeyDown={(e) => e.key === 'Enter' && addDomain()}
          />
          <button 
            onClick={addDomain}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            Aggiungi
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {settings.trustedDomains.map(domain => (
            <div key={domain} className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2 border border-blue-100">
              {domain}
              <button onClick={() => removeDomain(domain)} className="hover:text-blue-900">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 1. Base File */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
              <FileSpreadsheet size={24} />
            </div>
            <h3 className="font-bold text-lg text-gray-800">1. File Base</h3>
          </div>
          
          {baseFile ? getFileStatusCard(baseFile) : (
            <label className="border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors mb-4 flex-grow">
              <Upload className="text-gray-400 mb-2" />
              <span className="text-sm text-gray-600 font-medium">Carica Excel/CSV</span>
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => handleFileUpload(e, FileType.BASE)} />
            </label>
          )}

          {baseFile && (
            <div className="mt-4 border-t pt-4 space-y-4">
              
              {/* SKU Selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                  <Hash size={12} /> Colonna SKU <span className="text-red-500">*</span>
                </label>
                <select 
                  value={baseSkuColumn}
                  onChange={(e) => setBaseSkuColumn(e.target.value)}
                  className="w-full p-2 bg-gray-50 border border-gray-200 rounded-md text-sm outline-none focus:border-blue-500"
                >
                  <option value="">-- Seleziona SKU --</option>
                  {baseHeaders.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* EAN Selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                  <Barcode size={12} /> Colonna EAN <span className="text-red-500">*</span>
                </label>
                <select 
                  value={baseEanColumn}
                  onChange={(e) => setBaseEanColumn(e.target.value)}
                  className="w-full p-2 bg-gray-50 border border-gray-200 rounded-md text-sm outline-none focus:border-blue-500"
                >
                  <option value="">-- Seleziona EAN --</option>
                  {baseHeaders.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Image Selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                  <LinkIcon size={12} /> Colonna URL Foto (Opzionale)
                </label>
                <select 
                  value={baseImageColumn}
                  onChange={(e) => setBaseImageColumn(e.target.value)}
                  className="w-full p-2 bg-gray-50 border border-gray-200 rounded-md text-sm outline-none focus:border-blue-500"
                >
                  <option value="">-- Nessuna --</option>
                  {baseHeaders.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-400 mt-1">L'AI analizzerà visivamente la foto.</p>
              </div>
            </div>
          )}
        </div>

        {/* 2. Manufacturer File */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <div className="bg-purple-100 p-2 rounded-lg text-purple-600">
              <FileSpreadsheet size={24} />
            </div>
            <h3 className="font-bold text-lg text-gray-800">2. File Produttore</h3>
          </div>
          
          {manuFile ? getFileStatusCard(manuFile) : (
            <label className="border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors mb-4 flex-grow">
              <Upload className="text-gray-400 mb-2" />
              <span className="text-sm text-gray-600 font-medium">Carica Excel/CSV</span>
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => handleFileUpload(e, FileType.MANUFACTURER)} />
            </label>
          )}

          {manuFile && (
            <div className="mt-4 border-t pt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                 {/* Manu SKU */}
                <div>
                  <label className="block text-[10px] font-semibold text-gray-700 mb-1">
                    Colonna SKU (Prod)
                  </label>
                  <select 
                    value={manuSkuColumn}
                    onChange={(e) => setManuSkuColumn(e.target.value)}
                    className="w-full p-1.5 bg-gray-50 border border-gray-200 rounded-md text-xs outline-none focus:border-purple-500"
                  >
                    <option value="">-- Seleziona --</option>
                    {manuHeaders.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
                {/* Manu EAN */}
                <div>
                  <label className="block text-[10px] font-semibold text-gray-700 mb-1">
                     Colonna EAN (Prod)
                  </label>
                  <select 
                    value={manuEanColumn}
                    onChange={(e) => setManuEanColumn(e.target.value)}
                    className="w-full p-1.5 bg-gray-50 border border-gray-200 rounded-md text-xs outline-none focus:border-purple-500"
                  >
                    <option value="">-- Seleziona --</option>
                    {manuHeaders.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              </div>

               {/* Manu Description Source */}
               <div>
                  <label className="block text-[10px] font-semibold text-gray-700 mb-1 flex items-center gap-1">
                     <AlignLeft size={10} /> Colonna Descrizione (Fonte)
                  </label>
                  <select 
                    value={manuDescColumn}
                    onChange={(e) => setManuDescColumn(e.target.value)}
                    className="w-full p-2 bg-indigo-50 border border-indigo-100 rounded-md text-xs outline-none focus:border-purple-500 text-indigo-900 font-medium"
                  >
                    <option value="">-- Auto Rilevamento --</option>
                    {manuHeaders.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <p className="text-[9px] text-gray-400 mt-1">Questa colonna verrà usata come fonte di contesto per l'AI, non come output diretto.</p>
                </div>
              
              <div className="pt-2 border-t border-gray-100">
                <button 
                  onClick={() => setShowMapping(!showMapping)}
                  className="w-full py-2 px-3 bg-purple-50 text-purple-700 rounded-lg text-sm font-medium flex items-center justify-center gap-2 hover:bg-purple-100 transition-colors"
                >
                  <Settings2 size={16} /> {showMapping ? 'Nascondi Mappatura' : 'Configura Mappatura Export'}
                </button>
                <p className="text-xs text-gray-400 mt-1 text-center">Associa colonne produttore ai campi export</p>
              </div>
            </div>
          )}
        </div>

        {/* 3. PDF Catalogs (Multi) */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <div className="bg-red-100 p-2 rounded-lg text-red-600">
              <FileText size={24} />
            </div>
            <h3 className="font-bold text-lg text-gray-800">3. Cataloghi PDF</h3>
          </div>
          
          <div className="max-h-40 overflow-y-auto mb-4 space-y-2">
             {pdfFiles.length > 0 && pdfFiles.map(f => getFileStatusCard(f))}
          </div>
          
          <label className="border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors flex-grow">
            <FileStack className="text-gray-400 mb-2" />
            <span className="text-sm text-gray-600 font-medium text-center">
              {pdfFiles.length > 0 ? 'Aggiungi altro PDF' : 'Carica Cataloghi PDF'}
            </span>
            <span className="text-[10px] text-gray-400 text-center mt-1">Puoi caricare più file</span>
            <input type="file" accept=".pdf" multiple className="hidden" onChange={(e) => handleFileUpload(e, FileType.PDF)} />
          </label>
        </div>
      </div>

      {/* Mapping UI Modal/Section */}
      {showMapping && manuFile && (
        <div className="bg-white border border-purple-200 rounded-xl shadow-lg p-6 animate-in slide-in-from-top-5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-bold text-lg text-gray-800 flex items-center gap-2">
              <List className="text-purple-600" /> Mappatura Campi Produttore
            </h4>
            <div className="flex gap-2">
               <button 
                 onClick={handleClearMapping}
                 className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded flex items-center gap-1 transition-colors"
               >
                 <RotateCcw size={12}/> Resetta
               </button>
               <button onClick={() => setShowMapping(false)} className="text-gray-400 hover:text-gray-600"><X /></button>
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-6">
            Per ogni colonna del file produttore, scegli a quale <strong>Campo Export</strong> corrisponde.
            I valori in queste colonne verranno usati come <strong>Dati Reali</strong> (sovrascrivendo l'AI).
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto pr-2">
            {manuHeaders.map(header => (
              <div key={header} className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                <div className="text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide truncate" title={header}>
                  Colonna File: <span className="text-gray-800">{header}</span>
                </div>
                <div className="flex items-center gap-2">
                  <ArrowRight size={14} className="text-purple-400 flex-shrink-0" />
                  <select 
                    value={getMappedSchemaId(header)}
                    onChange={(e) => handleMappingChange(header, e.target.value)}
                    className={`flex-grow p-1.5 text-sm border rounded outline-none focus:ring-2 focus:ring-purple-300 ${
                      getMappedSchemaId(header) ? 'bg-purple-50 border-purple-200 text-purple-700 font-medium' : 'bg-white text-gray-600'
                    }`}
                  >
                    <option value="">-- Ignora --</option>
                    {schema.filter(f => f.enabled).map(field => (
                      <option key={field.id} value={field.id}>{field.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* File Preview (Base) */}
      {baseFile && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
            <h4 className="font-bold text-gray-700">Anteprima Dati Base</h4>
          </div>
          <div className="overflow-x-auto max-h-60">
            <table className="w-full text-sm text-left text-gray-500">
              <thead className="text-xs text-gray-700 uppercase bg-gray-100 sticky top-0">
                <tr>
                  {Object.keys(baseFile.data[0] || {}).map((key) => (
                    <th key={key} className="px-6 py-3">{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {baseFile.data.slice(0, 5).map((row, idx) => (
                  <tr key={idx} className="bg-white border-b hover:bg-gray-50">
                    {Object.values(row).map((val: any, i) => (
                      <td key={i} className="px-6 py-4 whitespace-nowrap max-w-[200px] truncate">{val}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileImportTab;
