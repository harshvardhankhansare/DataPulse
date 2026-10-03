import { useState, useRef } from 'react';
import {
  LakehouseTable,
  JoinCandidate,
  JoinViewResult,
} from '@core/lakehouse/lakehouseTypes';
import SmartJoinModal from './SmartJoinModal';
import { useAppStore } from '../store/useAppStore';

export default function ImportPanel() {
  const applyImportResult = useAppStore(s => s.applyImportResult);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lakehouseData, setLakehouseData] = useState<{
    tables: LakehouseTable[];
    candidates: JoinCandidate[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = async (filePath: string, name?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.electron.importFile(filePath);
      if (result.success && result.schema && result.quality && result.applicableAnalyses) {
        applyImportResult({
          schema: result.schema,
          quality: result.quality,
          applicableAnalyses: result.applicableAnalyses,
          fileName: name || filePath.split(/[\\/]/).pop(),
        });
      } else {
        setError(result.error || 'Import failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMultiImport = async (filePaths: string[]) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await window.electron.importMultipleFiles(filePaths);
      if (res.success && res.tables && res.tables.length > 0) {
        setLakehouseData({
          tables: res.tables,
          candidates: res.joinCandidates || [],
        });
      } else {
        setError(res.error || 'Multi-file lakehouse import failed');
      }
    } catch (err: any) {
      setError(err.message || 'Error during multi-file ingestion');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClick = async () => {
    if (isLoading) return;
    try {
      if (window.electron?.selectMultipleFiles) {
        const filePaths = await window.electron.selectMultipleFiles();
        if (!filePaths || filePaths.length === 0) return;
        if (filePaths.length === 1) {
          await handleImport(filePaths[0], filePaths[0].split(/[\\/]/).pop());
        } else {
          await handleMultiImport(filePaths);
        }
      } else if (window.electron?.selectFile) {
        const filePath = await window.electron.selectFile();
        if (!filePath) return;
        await handleImport(filePath, filePath.split(/[\\/]/).pop());
      } else {
        fileInputRef.current?.click();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to select file');
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;

    const nativePaths = files.map(f => (f as any).path).filter(Boolean);
    if (nativePaths.length > 1 && typeof window.electron?.importMultipleFiles === 'function') {
      await handleMultiImport(nativePaths);
    } else if (nativePaths.length === 1) {
      await handleImport(nativePaths[0], files[0].name);
    }
  };

  return (
    <div>
      <input
        type="file"
        ref={fileInputRef}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) await handleImport((file as any).path || file.name, file.name);
        }}
        accept=".csv,.xlsx,.json,.parquet"
        className="hidden"
      />

      {/* Sidebar "Load File" button */}
      <button
        onClick={handleClick}
        disabled={isLoading}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '9px 12px',
          background: isLoading ? '#1e2440' : '#1a2236',
          border: '1px solid #2a3554',
          borderRadius: 8,
          color: isLoading ? '#60a5fa' : '#94a3b8',
          fontSize: 12,
          fontWeight: 600,
          cursor: isLoading ? 'not-allowed' : 'pointer',
          transition: 'all 0.14s',
          letterSpacing: '0.01em',
        }}
        onMouseEnter={(e) => {
          if (!isLoading) {
            (e.currentTarget as HTMLButtonElement).style.background = '#1e2a44';
            (e.currentTarget as HTMLButtonElement).style.color = '#c8d0e0';
            (e.currentTarget as HTMLButtonElement).style.borderColor = '#3b5280';
          }
        }}
        onMouseLeave={(e) => {
          if (!isLoading) {
            (e.currentTarget as HTMLButtonElement).style.background = '#1a2236';
            (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8';
            (e.currentTarget as HTMLButtonElement).style.borderColor = '#2a3554';
          }
        }}
      >
        {isLoading ? (
          <span className="dp-spinner" style={{ width: 13, height: 13 }} />
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        )}
        {isLoading ? 'Importing…' : 'Load File'}
      </button>

      {/* Supported formats */}
      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {['.csv', '.xlsx', '.json', '.parquet'].map(ext => (
          <span key={ext} style={{
            padding: '1px 6px', borderRadius: 4, fontSize: 10,
            background: '#131825', color: '#4a5878',
            border: '1px solid #1e2840', fontFamily: 'monospace',
          }}>{ext}</span>
        ))}
      </div>

      {error && (
        <div style={{
          marginTop: 8, padding: '7px 10px',
          background: '#2a1a1a', border: '1px solid #5c2020',
          borderRadius: 6, fontSize: 11, color: '#f87171', lineHeight: 1.4,
        }}>
          {error}
        </div>
      )}

      {lakehouseData && (
        <SmartJoinModal
          tables={lakehouseData.tables}
          candidates={lakehouseData.candidates}
          onCancel={() => setLakehouseData(null)}
          onJoinComplete={(result: JoinViewResult, blendName: string) => {
            applyImportResult({
              schema: result.schema,
              quality: result.quality,
              applicableAnalyses: result.applicableAnalyses,
              fileName: blendName,
            });
            setLakehouseData(null);
          }}
        />
      )}
    </div>
  );
}



