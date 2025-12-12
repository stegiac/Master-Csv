
export interface SchemaField {
  id: string;
  name: string; // Column Header in Export
  description: string; // What this field contains
  prompt: string; // Specific instruction to AI for this field
  enabled: boolean;
  strict: boolean; // true = Extract only, false = AI can articulate/generate
  allowedValues: string[]; // If not empty, restrict output to these values
  isCustom?: boolean; // Flag to identify user-added fields
  aiExplanation?: string; // Auto-generated user-friendly explanation
}

export interface ProcessLog {
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

export interface PdfExtractedData {
  sku: string;
  data: Record<string, string>; // Technical specs found in PDF
  visuals: Record<string, string>; // Visual attributes from images in PDF
  sourcePage?: string;
}

export interface ProcessedProduct {
  sku: string;
  ean: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  data: Record<string, string>; // Key is SchemaField.name, Value is result
  sourceMap?: Record<string, string>; // Key is SchemaField.name, Value is the source (e.g. "PDF", "Web", "Manu Desc")
  rawResponse?: string; // The full raw text response from AI for debugging
  error?: string;
  logs: ProcessLog[]; // History of processing steps
  pdfContextData?: PdfExtractedData; // Data extracted during PDF Batch Analysis
}

export type DataSourceType = 'MAPPING' | 'MANUFACTURER' | 'PDF' | 'WEB' | 'IMAGE';

export interface AppSettings {
  trustedDomains: string[];
  dataPriority: DataSourceType[]; // Ordered list of priorities
}

export enum FileType {
  BASE = 'BASE',
  MANUFACTURER = 'MANUFACTURER',
  PDF = 'PDF'
}

export interface UploadedFile {
  id: string;
  type: FileType;
  name: string;
  data: any[];
  rawFile?: File;
}

export type ColumnMapping = Record<string, string>;
