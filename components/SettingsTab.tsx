
import React from 'react';
import { ShieldCheck, ArrowUp, ArrowDown, Layers, Eye, EyeOff } from 'lucide-react';
import { AppSettings, DataSourceType } from '../types';

interface Props {
  settings: AppSettings;
  setSettings: (s: AppSettings) => void;
}

const SettingsTab: React.FC<Props> = ({ settings, setSettings }) => {
  
  const priorityLabels: Record<DataSourceType, string> = {
    'MAPPING': 'Mappatura Diretta (Forzata)',
    'MANUFACTURER': 'File Excel Produttore',
    'PDF': 'Cataloghi PDF',
    'WEB': 'Ricerca Web (Google)',
    'IMAGE': 'Analisi Visiva (Foto)',
    'DERIVED': 'Dati Derivati (Calcoli/Logica)',
    'AI': 'Generazione AI (Pura)'
  };

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

  const toggleSource = (type: DataSourceType) => {
    const isDisabled = settings.disabledSources.includes(type);
    const newDisabled = isDisabled 
      ? settings.disabledSources.filter(s => s !== type)
      : [...settings.disabledSources, type];
    
    setSettings({ ...settings, disabledSources: newDisabled });
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
            <p className="text-sm text-gray-500">L'AI userà i dati della fonte attiva più in alto. Disabilita le fonti che non vuoi usare.</p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {settings.dataPriority.map((type, index) => {
            const isDisabled = settings.disabledSources.includes(type);
            return (
              <div key={type} className={`flex items-center gap-4 p-4 rounded-lg border transition-all group ${isDisabled ? 'bg-gray-100 border-gray-200 opacity-60' : 'bg-white border-gray-200 hover:shadow-md hover:border-indigo-200'}`}>
                <div className={`font-mono text-2xl font-bold w-8 text-center ${isDisabled ? 'text-gray-300' : 'text-indigo-200'}`}>
                  {index + 1}
                </div>
                
                <div className="flex-grow">
                  <div className="flex items-center gap-2">
                    <h4 className={`font-bold text-sm md:text-base ${isDisabled ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                      {priorityLabels[type]}
                    </h4>
                    {isDisabled && <span className="text-[9px] bg-gray-200 text-gray-500 px-1.5 rounded uppercase font-bold tracking-tighter">Disabilitata</span>}
                  </div>
                  <p className="text-xs text-gray-400 hidden md:block">{priorityDescriptions[type]}</p>
                </div>

                <div className="flex items-center gap-2">
                   {/* Toggle Button */}
                   <button 
                     onClick={() => toggleSource(type)}
                     className={`p-2 rounded-lg transition-colors ${isDisabled ? 'bg-gray-200 text-gray-500' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}
                     title={isDisabled ? "Abilita Fonte" : "Disabilita Fonte"}
                   >
                     {isDisabled ? <EyeOff size={18} /> : <Eye size={18} />}
                   </button>

                   <div className="flex flex-col gap-0.5 border-l border-gray-200 pl-2 ml-1">
                     <button 
                       onClick={() => moveItem(index, 'up')}
                       disabled={index === 0}
                       className={`p-1 rounded hover:bg-indigo-50 hover:text-indigo-600 transition-colors ${index === 0 ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400'}`}
                     >
                       <ArrowUp size={16} />
                     </button>
                     <button 
                       onClick={() => moveItem(index, 'down')}
                       disabled={index === settings.dataPriority.length - 1}
                       className={`p-1 rounded hover:bg-indigo-50 hover:text-indigo-600 transition-colors ${index === settings.dataPriority.length - 1 ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400'}`}
                     >
                       <ArrowDown size={16} />
                     </button>
                   </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-blue-800 text-sm flex items-start gap-3">
        <ShieldCheck className="flex-shrink-0 mt-0.5" size={18} />
        <p>
          <strong>Consiglio:</strong> Se vuoi evitare ricerche web lunghe, clicca sull'icona dell'occhio accanto a <strong>Ricerca Web (Google)</strong>. 
          L'AI si limiterà a leggere i tuoi file PDF e il foglio Excel del produttore.
        </p>
      </div>

    </div>
  );
};

// Fixed: Added default export for the SettingsTab component
export default SettingsTab;
