export enum ColumnType {
  NUMERIC = 'numeric',
  CATEGORICAL = 'categorical',
  DATE = 'date',
  BOOLEAN = 'boolean',
  TEXT = 'text',
  IDENTIFIER = 'identifier'
}

export interface ColumnMetadata {
  name: string;
  detectedType: ColumnType;
  duckdbType: string;
  distinctCount: number;
  nullCount: number;
  totalRows: number;
  sampleValues?: any[];
}

export interface TableSchema {
  tableName: string;
  columns: ColumnMetadata[];
}
