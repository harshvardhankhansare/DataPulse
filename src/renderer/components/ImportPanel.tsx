import { useState, useRef } from 'react';
import {
  LakehouseTable,
  JoinCandidate,
  JoinViewResult,
} from '@core/lakehouse/lakehouseTypes';
import SmartJoinModal from './SmartJoinModal';
import { useAppStore } from '../store/useAppStore';
import { useToast } from './Toast';

export default function ImportPanel() {
  const applyImportResult = useAppStore(s => s.applyImportResult);
  const schema = useAppStore(s => s.schema);
  const fileName = useAppStore(s => s.fileName);
  const [isSaving, setSaving] = useState(false);
  const [isOpening, setOpening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lakehouseData, setLakehouseData] = useState<{
    tables: LakehouseTable[];
    candidates: JoinCandidate[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addToast } = useToast();

  const handleImport = async (filePath: string, name?: string) => {
    setIsLoading(true);
    try {
      const result = await window.electron.importFile(filePath);
      if (result.success && result.schema && result.quality && result.applicableAnalyses) {
        applyImportResult({
          schema: result.schema,
          quality: result.quality,
          applicableAnalyses: result.applicableAnalyses,
          fileName: name || filePath.split(/[\\/]/).pop(),
        });
        addToast(`✓ Imported ${name || filePath.split(/[\\/]/).pop()} successfully`, 'success');
      } else {
        addToast(result.error || 'Import failed', 'error');
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Unknown error occurred', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMultiImport = async (filePaths: string[]) => {
    setIsLoading(true);
    try {
      const res = await window.electron.importMultipleFiles(filePaths);
      if (res.success && res.tables && res.tables.length > 0) {
        setLakehouseData({
          tables: res.tables,
          candidates: res.joinCandidates || [],
        });
        addToast(`✓ Imported ${res.tables.length} files successfully`, 'success');
      } else {
        addToast(res.error || 'Multi-file lakehouse import failed', 'error');
      }
    } catch (err: any) {
      addToast(err.message || 'Error during multi-file ingestion', 'error');
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
      addToast(err instanceof Error ? err.message : 'Unable to select file', 'error');
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

  /* ── Project persistence actions ─────────────────────── */

  const handleSaveProject = async () => {
    if (!schema || isSaving) return;
    setSaving(true);
    try {
      const res = await window.electron.saveProject(schema.tableName, fileName);
      if (res.success && res.filePath) {
        addToast(`✓ Project saved: ${res.filePath}`, 'success');
      } else if (!res.canceled && res.error) {
        addToast(`Save failed: ${res.error}`, 'error');
      }
    } catch (err) {
      addToast(`Save failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenProject = async () => {
    if (isOpening) return;
    setOpening(true);
    try {
      const res = await window.electron.openProject();
      if (res.success && res.schema && res.quality && res.applicableAnalyses) {
        applyImportResult({
          schema: res.schema,
          quality: res.quality,
          applicableAnalyses: res.applicableAnalyses,
          fileName: res.fileName,
        });
        addToast(`✓ Project loaded: ${res.fileName}`, 'success');
      } else if (!res.canceled && res.error) {
        addToast(`Open failed: ${res.error}`, 'error');
      }
    } catch (err) {
      addToast(`Open failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    } finally {
      setOpening(false);
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

      {/* Save / Open Project row */}
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <button
          onClick={handleSaveProject}
          disabled={!schema || isSaving}
          title={schema ? 'Save the current dataset (with all edits) as a .duckdb project file' : 'Load a dataset first'}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '7px 10px',
            background: '#141b2e',
            border: '1px solid #243050',
            borderRadius: 7,
            color: schema ? '#7dd3fc' : '#3a4660',
            fontSize: 11,
            fontWeight: 600,
            cursor: !schema || isSaving ? 'not-allowed' : 'pointer',
            transition: 'all 0.14s',
          }}
        >
          {isSaving ? (
            <span className="dp-spinner" style={{ width: 11, height: 11 }} />
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
            </svg>
          )}
          {isSaving ? 'Saving…' : 'Save Project'}
        </button>

        <button
          onClick={handleOpenProject}
          disabled={isOpening}
          title="Open a previously saved .duckdb project file"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '7px 10px',
            background: '#141b2e',
            border: '1px solid #243050',
            borderRadius: 7,
            color: isOpening ? '#3a4660' : '#7dd3fc',
            fontSize: 11,
            fontWeight: 600,
            cursor: isOpening ? 'not-allowed' : 'pointer',
            transition: 'all 0.14s',
          }}
        >
          {isOpening ? (
            <span className="dp-spinner" style={{ width: 11, height: 11 }} />
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          )}
          {isOpening ? 'Opening…' : 'Open Project'}
        </button>
      </div>

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



