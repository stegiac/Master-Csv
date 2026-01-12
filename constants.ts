
import { SchemaField, FieldClass, FillPolicy } from './types';

const createField = (
  id: string, 
  name: string, 
  description: string, 
  prompt: string, 
  fieldClass: FieldClass = 'HARD', 
  fillPolicy: FillPolicy = 'REQUIRED_EVIDENCE',
  allowedValues: string[] = []
): SchemaField => ({
  id, name, description, prompt, enabled: true, strict: fieldClass === 'HARD', 
  fieldClass, fillPolicy, allowedValues, isCustom: false
});

export const DEFAULT_SCHEMA: SchemaField[] = [
  createField('3', 'NOME SERIE', 'Famiglia prodotto', 'Nome collezione.', 'HARD', 'REQUIRED_EVIDENCE'),
  createField('4', 'TITOLO', 'Nome e-com', 'Titolo SEO.', 'SOFT', 'CREATIVE_ONLY'),
  createField('5', 'DESCRIZIONE', 'HTML Body', 'Descrizione ricca.', 'SOFT', 'CREATIVE_ONLY'),
  createField('20', 'CLASSE IP', 'Protezione', 'Grado IP (es IP20).', 'HARD', 'REQUIRED_EVIDENCE'),
  createField('21', 'CLASSE ENERGETICA', 'Energy', 'A-G.', 'HARD', 'REQUIRED_EVIDENCE', ['A', 'B', 'C', 'D', 'E', 'F', 'G']),
  createField('25', 'WATT', 'Potenza', 'Watt nominali.', 'HARD', 'REQUIRED_EVIDENCE'),
  createField('36', 'CORPO ALTEZZA GENERALE', 'Altezza cm', 'Altezza totale.', 'HARD', 'REQUIRED_EVIDENCE'),
  createField('41', 'CORPO LUNGHEZZA', 'Lunghezza cm', 'Lunghezza.', 'HARD', 'REQUIRED_EVIDENCE'),
  createField('42', 'CORPO LARGHEZZA', 'Larghezza cm', 'Larghezza.', 'HARD', 'REQUIRED_EVIDENCE'),
  createField('65', 'Misure_Generali', 'Riepilogo', 'Formato AxBxC.', 'HARD', 'ALLOW_INFER'),
  createField('70', 'url_friendly', 'Slug', 'URL SEO.', 'SOFT', 'ALLOW_INFER'),
];

export const DEFAULT_TRUSTED_DOMAINS = ['amazon.it', 'ebay.it', 'leroymerlin.it'];
export const PIPELINE_VERSION = "2.1.0-industrial";
