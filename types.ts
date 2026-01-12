
export type DataSourceType = 'MAPPING' | 'MANUFACTURER' | 'PDF' | 'WEB' | 'IMAGE' | 'DERIVED' | 'AI';
export type FieldClass = 'HARD' | 'SOFT';
export type FillPolicy = 'REQUIRED_EVIDENCE' | 'ALLOW_INFER' | 'CREATIVE_ONLY';
export type FieldStatus = 'LOCKED' | 'STRICT' | 'ENRICHED' | 'EMPTY';
export type Severity = 'info' | 'warn' | 'error';
export type WarningAction = 'none' | 'review' | 'block_export';

export interface Warning {
  message: string;
  severity: Severity;
  action?: WarningAction;
}

export interface SchemaField {
  id: string;
  name: string;
  description: string;
  prompt: string;
  enabled: boolean;
  strict: boolean; 
  fieldClass: FieldClass;
  fillPolicy: FillPolicy;
  allowedValues: string[];
  isCustom?: boolean;
  aiExplanation?: string;
}

export interface SourceInfo {
  source: string;
  sourceType: DataSourceType;
  confidence: 'high' | 'medium' | 'low';
  evidence?: string;
  evidencePointer?: string;
  url?: string;
  status: FieldStatus;
  warnings: Warning[];
  pipelineVersion: string;
}

export interface ProcessedProduct {
  sku: string;
  ean: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  data: Record<string, string>;
  sourceMap: Record<string, SourceInfo>;
  rawResponse?: string;
  error?: string;
  logs: any[];
}

export interface AppSettings {
  trustedDomains: string[];
  dataPriority: DataSourceType[];
  pipelineVersion: string;
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
