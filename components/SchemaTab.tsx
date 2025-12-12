
import React, { useState } from 'react';
import { Plus, Trash2, Edit2, Save, AlertCircle, Lock, Sparkles, RefreshCw, Check, Tag, Loader2, Lightbulb, ShieldAlert, ArrowUp, ArrowDown, Download } from 'lucide-react';
import { SchemaField } from '../types';
import { DEFAULT_SCHEMA } from '../constants';
import { generateFieldExplanation } from '../services/geminiService';

interface Props {
  schema: SchemaField[];
  setSchema: (schema: SchemaField[]) => void;
}

const SchemaTab: React.FC<Props> = ({ schema, setSchema }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempField, setTempField] = useState<SchemaField | null>(null);
  const [rawValuesInput, setRawValuesInput] = useState(''); // Local state for smooth textarea editing
  const [isGeneratingExpl, setIsGeneratingExpl] = useState(false);

  const handleEdit = (field: SchemaField) => {
    setEditingId(field.id);
    setTempField({ ...field });
    setRawValuesInput(field.allowedValues ? field.allowedValues.join('\n') : '');
  };

  const handleSave = () => {
    if (tempField) {
      setSchema(schema.map(f => f.id === tempField.id ? tempField : f));
      setEditingId(null);
      setTempField(null);
      setRawValuesInput('');
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Sei sicuro di voler eliminare questo campo?")) {
      setSchema(schema.filter(f => f.id !== id));
    }
  };

  const handleAdd = () => {
    const newField: SchemaField = {
      id: Date.now().toString(),
      name: 'Nuova Colonna',
      description: 'Descrizione del campo personalizzato...',
      prompt: 'Istruzione specifica per l\'AI...',
      enabled: true,
      strict: true,
      allowedValues: [],
      isCustom: true,
      aiExplanation: ''
    };
    setSchema([...schema, newField]);
    handleEdit(newField);
  };

  const handleReset = () => {
    if (confirm('ATTENZIONE: Questa azione ripristinerà lo schema predefinito. Tutte le modifiche e i campi personalizzati andranno persi. Continuare?')) {
      setSchema(DEFAULT_SCHEMA);
    }
  };

  const handleExportSchema = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(schema, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "schema_export_config.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const moveField = (index: number, direction: 'up' | 'down') => {
    const newSchema = [...schema];
    if (direction === 'up') {
      if (index === 0) return;
      [newSchema[index - 1], newSchema[index]] = [newSchema[index], newSchema[index - 1]];
    } else {
      if (index === newSchema.length - 1) return;
      [newSchema[index + 1], newSchema[index]] = [newSchema[index], newSchema[index + 1]];
    }
    setSchema(newSchema);
  };

  const handleValuesChange = (text: string) => {
    setRawValuesInput(text);
    if (!tempField) return;
    // Split by newline OR comma, then clean up
    const values = text.split(/[\n,]/).map(v => v.trim()).filter(v => v.length > 0);
    setTempField({ ...tempField, allowedValues: values });
  };

  const handleGenerateExplanation = async () => {
    if (!tempField) return;
    setIsGeneratingExpl(true);
    const explanation = await generateFieldExplanation(tempField);
    setTempField(prev => prev ? ({ ...prev, aiExplanation: explanation }) : null);
    setIsGeneratingExpl(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div>
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            Configurazione Export
            <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1 font-medium uppercase">
              <Check size={10} /> Salvataggio Autom
            </span>
          </h3>
          <p className="text-sm text-gray-500">Definisci colonne, prompt e regole di validazione.</p>
        </div>
        <div className="flex gap-2">
           <button 
            onClick={handleExportSchema}
            className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-2 rounded-lg transition-colors text-sm shadow-sm"
            title="Scarica configurazione JSON"
          >
            <Download size={16} /> Esporta JSON
          </button>
          <button 
            onClick={handleReset}
            className="flex items-center gap-2 text-gray-500 hover:text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors text-sm"
          >
            <RefreshCw size={16} /> Ripristina Default
          </button>
          <button 
            onClick={handleAdd}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-sm transition-colors"
          >
            <Plus size={18} /> Aggiungi Campo
          </button>
        </div>
      </div>

      <div className="grid gap-4">
        {schema.map((field, index) => (
          <div key={field.id} className={`bg-white p-4 rounded-xl border ${field.enabled ? (field.isCustom ? 'border-indigo-200 ring-1 ring-indigo-50' : 'border-gray-200') : 'border-gray-100 opacity-75'} shadow-sm transition-all`}>
            {editingId === field.id && tempField ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2 border-b border-gray-100 pb-2">
                  <span className="text-sm font-bold text-indigo-600 uppercase tracking-wider">Modifica Campo {field.isCustom ? '(Personalizzato)' : ''}</span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Nome Colonna (Header Excel)</label>
                    <input 
                      type="text" 
                      value={tempField.name} 
                      onChange={(e) => setTempField({...tempField, name: e.target.value})}
                      className="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Descrizione Interna</label>
                    <input 
                      type="text" 
                      value={tempField.description} 
                      onChange={(e) => setTempField({...tempField, description: e.target.value})}
                      className="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>

                {/* AI Explanation Generator */}
                <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                    <div className="flex justify-between items-start mb-2">
                        <label className="text-xs font-bold text-indigo-800 flex items-center gap-1">
                            <Lightbulb size={12} className="text-yellow-600" /> Spiegazione AI (User-Friendly)
                        </label>
                        <button
                            onClick={handleGenerateExplanation}
                            disabled={isGeneratingExpl}
                            className="text-[10px] bg-indigo-600 text-white px-2 py-1 rounded flex items-center gap-1 hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                        >
                            {isGeneratingExpl ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                            Genera con AI
                        </button>
                    </div>
                    <textarea
                        value={tempField.aiExplanation || ''}
                        onChange={(e) => setTempField({ ...tempField, aiExplanation: e.target.value })}
                        className="w-full p-2 text-xs border border-indigo-200 rounded bg-white text-indigo-900 focus:outline-none focus:ring-1 focus:ring-indigo-400 placeholder-indigo-300"
                        placeholder="Clicca 'Genera' per creare una spiegazione automatica di questo campo..."
                        rows={2}
                    />
                </div>

                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-gray-700">Regole e Comportamento AI</span>
                    <div className="flex items-center bg-white rounded-lg border border-gray-200 p-1">
                      <button 
                        onClick={() => setTempField({...tempField, strict: false})}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md flex items-center gap-1 transition-colors ${!tempField.strict ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
                        title="L'AI può generare testo discorsivo e creativo ma basato su dati reali"
                      >
                        <Sparkles size={14} /> Creativa
                      </button>
                      <button 
                        onClick={() => setTempField({...tempField, strict: true})}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md flex items-center gap-1 transition-colors ${tempField.strict ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
                        title="L'AI deve estrarre solo dati esatti, senza inventare"
                      >
                        <Lock size={14} /> Rigorosa
                      </button>
                    </div>
                  </div>

                  {/* Contextual Explanation of Mode */}
                  <div className={`text-[11px] p-2 rounded border flex gap-2 ${tempField.strict ? 'bg-indigo-50 border-indigo-100 text-indigo-800' : 'bg-blue-50 border-blue-100 text-blue-800'}`}>
                    {tempField.strict ? (
                        <>
                           <ShieldAlert size={14} className="flex-shrink-0 mt-0.5" />
                           <p><strong>Modalità Rigorosa:</strong> L'AI estrarrà il dato esattamente come appare (OCR/Raw). Se il dato non esiste, restituirà cella vuota. Ideale per: <i>Dimensioni, Watt, Codici IP, EAN, Codici Articolo.</i></p>
                        </>
                    ) : (
                        <>
                           <Sparkles size={14} className="flex-shrink-0 mt-0.5" />
                           <div>
                             <p className="mb-1"><strong>Modalità Creativa:</strong> L'AI genererà testo discorsivo fluido (copywriting). Ideale per: <i>Descrizioni, Titoli, Punti di forza.</i></p>
                             <p className="font-semibold text-blue-900 border-t border-blue-200 pt-1 mt-1">⚠️ REGOLA: Anche in questa modalità, l'AI si atterrà ai dati reali. Non inventerà funzioni o valori inesistenti.</p>
                           </div>
                        </>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Prompt AI (Istruzioni Specifiche)</label>
                    <textarea 
                      value={tempField.prompt} 
                      onChange={(e) => setTempField({...tempField, prompt: e.target.value})}
                      className="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none h-20 text-sm font-mono bg-white"
                      placeholder="Es: Estrai il materiale principale..."
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
                       <AlertCircle size={12} /> Regole di Validazione (Valori Ammessi)
                    </label>
                    <textarea 
                      value={rawValuesInput}
                      onChange={(e) => handleValuesChange(e.target.value)}
                      className="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none h-32 text-sm font-mono bg-white"
                      placeholder="Es: SI&#10;NO&#10;FORSE"
                    />
                    <p className="text-[10px] text-gray-500 mt-1">
                      Inserisci un valore per riga (o separati da virgola). L'AI sarà costretta a scegliere UNO di questi valori.
                    </p>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                   <button onClick={() => setEditingId(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md">Annulla</button>
                   <button onClick={handleSave} className="px-4 py-2 text-sm bg-green-600 text-white hover:bg-green-700 rounded-md flex items-center gap-2"><Save size={16} /> Salva</button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between">
                <div className="flex-grow">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-bold text-gray-800">{field.name}</h4>
                    {field.isCustom && (
                       <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full border border-indigo-100 flex items-center gap-1 font-semibold uppercase tracking-wider">
                         <Tag size={10} /> Custom
                       </span>
                    )}
                    {field.strict ? (
                      <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full border border-gray-200 flex items-center gap-1">
                        <Lock size={10} /> Rigoroso
                      </span>
                    ) : (
                      <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-100 flex items-center gap-1">
                        <Sparkles size={10} /> Creativo (No Hallucination)
                      </span>
                    )}
                    {field.allowedValues && field.allowedValues.length > 0 && (
                       <span className="text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full border border-purple-100" title={field.allowedValues.join(', ')}>
                       Lista: {field.allowedValues.length} opz.
                     </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mb-2">{field.description}</p>
                  
                  {field.aiExplanation && (
                    <div className="mt-2 text-xs text-gray-600 bg-yellow-50/80 p-2 rounded flex items-start gap-2 border border-yellow-100">
                        <Lightbulb size={12} className="mt-0.5 text-yellow-600 flex-shrink-0" />
                        <span className="italic">{field.aiExplanation}</span>
                    </div>
                  )}

                  <div className="text-xs text-gray-400 mt-2 truncate max-w-lg">
                    <span className="font-semibold text-gray-500">Prompt:</span> {field.prompt}
                  </div>
                </div>
                
                {/* Actions: Edit, Delete, Reorder */}
                <div className="flex flex-col gap-1 items-center ml-4 border-l pl-4 border-gray-100">
                  <div className="flex gap-1 mb-2">
                     <button 
                       onClick={() => moveField(index, 'up')}
                       disabled={index === 0}
                       className={`p-1 rounded ${index === 0 ? 'text-gray-200' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'}`}
                     >
                       <ArrowUp size={16} />
                     </button>
                     <button 
                       onClick={() => moveField(index, 'down')}
                       disabled={index === schema.length - 1}
                       className={`p-1 rounded ${index === schema.length - 1 ? 'text-gray-200' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'}`}
                     >
                       <ArrowDown size={16} />
                     </button>
                  </div>
                  
                  <div className="flex gap-1">
                    <button onClick={() => handleEdit(field)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Modifica">
                        <Edit2 size={16} />
                    </button>
                    <button onClick={() => handleDelete(field.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Elimina">
                        <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SchemaTab;
