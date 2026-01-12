
import React from 'react';
import { ShieldCheck, ArrowUp, ArrowDown, Layers } from 'lucide-react';
import { AppSettings, DataSourceType } from '../types';

interface Props {
  settings: AppSettings;
  setSettings: (s: AppSettings) => void;
}

const SettingsTab: React.FC<Props> = ({ settings, setSettings }) => {
  
  // Added 'AI' property to satisfy Record<DataSourceType, string> as defined in types.ts
  const priorityLabels: Record<DataSourceType, string> = {
    'MAPPING': 'Mappatura Diretta (Forzata)',
    'MANUFACTURER': 'File Excel Produttore',
    'PDF': 'Cataloghi PDF',
    'WEB': 'Ricerca Web (Google)',
    'IMAGE': 'Analisi Visiva (Foto)',
    'DERIVED': 'Dati Derivati (Calcoli/Logica)',
    'AI': 'Generazione AI (Pura)'
  };

  // Added 'AI' property to satisfy Record<DataSourceType, string> as defined in types.ts
  const priorityDescriptions: Record<DataSourceType, string> = {
    'MAPPING': 'Valori mappati manualmente dall\'utente. Massima priorità, sovrascrive tutto.',
    'MANUFACTURER': 'Dati tecnici presenti nel file Excel fornito dal produttore.',
    'PDF': 'Specifiche tecniche estratte dalla lettura dei file PDF caricati.',
    'WEB': 'Dati trovati online (sito ufficiale, e-commerce, schede tecniche).',
    'IMAGE': 'Attributi estetici (colore, forma, materiali) dedotti dalla foto.',
    'DERIVED': 'Informazioni generate combinando o trasformando altri attributi del prodotto.',
    'AI': 'Informazioni generate interamente dal modello linguistico senza riferimenti esterni diretti.'
  };

  const moveItem = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...settings.dataPriority];
    if (direction === 'up') {
      if (index === 0) return;
      [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    } else {
      if (index === newOrder.length - 1) return;
      [newOrder[index + 1], newOrder[index]] = [newOrder[index], newOrder[index + 1]];
    }
    setSettings({ ...settings, dataPriority: newOrder });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center gap-2 mb-2">
          <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
            <Layers size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-800">Gerarchia Fonti Dati</h3>
            <p className="text-sm text-gray-500">Definisci l'ordine di importanza delle fonti. L'AI userà i dati della fonte più in alto se disponibili.</p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {settings.dataPriority.map((type, index) => (
            <div key={type} className="flex items-center gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200 transition-all hover:shadow-md hover:border-indigo-200 group">
              <div className="font-mono text-2xl font-bold text-gray-300 w-8 text-center">
                {index + 1}
              </div>
              
              <div className="flex-grow">
                <h4 className="font-bold text-gray-800 text-sm md:text-base">{priorityLabels[type]}</h4>
                <p className="text-xs text-gray-500 hidden md:block">{priorityDescriptions[type]}</p>
              </div>

              <div className="flex flex-col gap-1">
                 <button 
                   onClick={() => moveItem(index, 'up')}
                   disabled={index === 0}
                   className={`p-1 rounded hover:bg-indigo-100 hover:text-indigo-600 transition-colors ${index === 0 ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400'}`}
                 >
                   <ArrowUp size={18} />
                 </button>
                 <button 
                   onClick={() => moveItem(index, 'down')}
                   disabled={index === settings.dataPriority.length - 1}
                   className={`p-1 rounded hover:bg-indigo-100 hover:text-indigo-600 transition-colors ${index === settings.dataPriority.length - 1 ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400'}`}
                 >
                   <ArrowDown size={18} />
                 </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-blue-800 text-sm flex items-start gap-3">
        <ShieldCheck className="flex-shrink-0 mt-0.5" size={18} />
        <p>
          <strong>Nota:</strong> La "Mappatura Diretta" e il "File Produttore" sono generalmente i dati più affidabili. 
          Si consiglia di mantenerli in cima alla lista per evitare che l'AI sovrascriva dati certi con informazioni trovate sul web.
        </p>
      </div>

    </div>
  );
};

export default SettingsTab;
