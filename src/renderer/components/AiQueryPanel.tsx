import { useState, useEffect } from 'react';
import { TableSchema } from '@core/schema/schemaTypes';
import { ChartConfig } from '@core/charts/chartTypes';
import { ChartCard } from './ChartGrid';

interface AiQueryPanelProps {
  schema: TableSchema;
}

interface AiServerState {
  available: boolean;
  provider: string;
  endpoint: string;
  modelName?: string;
  error?: string;
}

export default function AiQueryPanel({ schema }: AiQueryPanelProps) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [customEndpoint, setCustomEndpoint] = useState('http://127.0.0.1:1234/v1');
  const [showSettings, setShowSettings] = useState(false);
  const [serverState, setServerState] = useState<AiServerState>({
    available: false,
    provider: 'none',
    endpoint: 'http://127.0.0.1:1234/v1',
  });

  const [queryResult, setQueryResult] = useState<{
    sql?: string;
    rows?: Record<string, any>[];
    chartConfig?: ChartConfig | null;
    error?: string;
  } | null>(null);

  const checkConnection = async (url?: string) => {
    if (!window.electron?.checkAiStatus) return;
    try {
      const status = await window.electron.checkAiStatus(url || customEndpoint);
      setServerState(status);
    } catch {
      setServerState({
        available: false,
        provider: 'none',
        endpoint: url || customEndpoint,
        error: 'Failed to connect to local AI server.',
      });
    }
  };

  useEffect(() => {
    checkConnection();
    const interval = setInterval(() => checkConnection(), 15000);
    return () => clearInterval(interval);
  }, [customEndpoint]);

  const handleAsk = async (promptText?: string) => {
    const q = promptText || question;
    if (!q.trim() || loading) return;

    setLoading(true);
    setQueryResult(null);

    try {
      const res = await window.electron.queryAi(schema.tableName, q, customEndpoint);
      if (res.success) {
        setQueryResult({
          sql: res.sql,
          rows: res.rows,
          chartConfig: res.chartConfig,
        });
      } else {
        setQueryResult({
          error: res.error || 'Failed to generate query.',
          sql: res.sql,
        });
      }
    } catch (err) {
      setQueryResult({
        error: err instanceof Error ? err.message : 'Unknown AI query execution error.',
      });
    } finally {
      setLoading(false);
    }
  };

  // Generate dynamic suggestion chips based on table columns
  const numericCols = schema.columns.filter(c => c.detectedType === 'numeric');
  const catCols = schema.columns.filter(c => c.detectedType === 'categorical');
  const suggestions: string[] = [];

  if (numericCols.length > 0 && catCols.length > 0) {
    suggestions.push(`Total ${numericCols[0].name} by ${catCols[0].name}`);
    suggestions.push(`Average ${numericCols[0].name} by ${catCols[0].name}`);
  }
  if (numericCols.length >= 2) {
    suggestions.push(`Compare ${numericCols[0].name} vs ${numericCols[1].name}`);
  }
  if (suggestions.length === 0 && schema.columns.length > 0) {
    suggestions.push(`Count rows grouped by ${schema.columns[0].name}`);
  }

  return (
    <section style={{
      background: '#111726',
      borderRadius: 12,
      border: '1px solid #1e293b',
      padding: '24px',
      marginTop: '16px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
    }}>
      {/* Header & Status */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        paddingBottom: '16px',
        borderBottom: '1px solid #1e293b',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>🤖</span>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
              Local AI Assistant (LM Studio)
            </h2>
            <span style={{
              padding: '2px 8px',
              borderRadius: '99px',
              fontSize: '11px',
              fontWeight: 600,
              background: 'rgba(59, 130, 246, 0.15)',
              color: '#60a5fa',
              border: '1px solid rgba(59, 130, 246, 0.3)',
            }}>
              Phase 7
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>
            Ask natural-language questions to query DuckDB with your local LLM model
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {serverState.available ? (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '99px',
              fontSize: '12px',
              fontWeight: 600,
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#34d399',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></span>
              <span>LM Studio: {serverState.modelName}</span>
            </span>
          ) : (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '99px',
              fontSize: '12px',
              fontWeight: 600,
              background: 'rgba(245, 158, 11, 0.15)',
              color: '#fbbf24',
              border: '1px solid rgba(245, 158, 11, 0.3)',
            }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }}></span>
              <span>Local Model Offline</span>
            </span>
          )}

          <button
            onClick={() => setShowSettings(!showSettings)}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid #1e293b',
              background: '#161f32',
              color: '#94a3b8',
              fontSize: '12px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title="Configure endpoint"
          >
            ⚙️
          </button>

          <button
            onClick={() => checkConnection()}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid #1e293b',
              background: '#161f32',
              color: '#94a3b8',
              fontSize: '12px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title="Refresh status"
          >
            🔄
          </button>
        </div>
      </div>

      {/* Settings Drawer */}
      {showSettings && (
        <div style={{
          marginTop: '12px',
          padding: '12px 16px',
          background: '#0d1322',
          borderRadius: '8px',
          border: '1px solid #1e293b',
          fontSize: '12px',
        }}>
          <div style={{ fontWeight: 600, color: '#f8fafc', marginBottom: '8px' }}>
            Local Server Settings:
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={customEndpoint}
              onChange={(e) => setCustomEndpoint(e.target.value)}
              placeholder="http://127.0.0.1:1234/v1"
              style={{
                flex: 1,
                padding: '6px 12px',
                border: '1px solid #1e293b',
                background: '#080c14',
                color: '#f8fafc',
                borderRadius: '6px',
                outline: 'none',
                fontFamily: 'monospace',
                fontSize: '12px',
              }}
            />
            <button
              onClick={() => checkConnection(customEndpoint)}
              style={{
                padding: '6px 14px',
                background: '#3b82f6',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Connect
            </button>
          </div>
          <p style={{ margin: '8px 0 0', color: '#94a3b8', fontSize: '11px' }}>
            * In LM Studio, click the <b>Developer / Local Server</b> tab (↔) and click <b>Start Server</b> (Port 1234).
          </p>
        </div>
      )}

      {/* Offline Guidance Notice if unavailable */}
      {!serverState.available && !showSettings && (
        <div style={{
          marginTop: '14px',
          padding: '12px 16px',
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px',
          fontSize: '12px',
          color: '#fde68a',
        }}>
          <span style={{ fontSize: '16px' }}>💡</span>
          <div>
            <span style={{ fontWeight: 600 }}>Connect your Local LLM:</span> Launch <b>LM Studio</b>, start the local server on port <b>1234</b>, and load any model (e.g. Llama, Mistral, Qwen, DeepSeek). You can also use Ollama on port 11434.
          </div>
        </div>
      )}

      {/* Query Input Box */}
      <div style={{ marginTop: '16px' }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAsk();
          }}
          style={{ display: 'flex', gap: '8px' }}
        >
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question (e.g., 'What are the top products by total quantity?')"
            disabled={loading}
            style={{
              flex: 1,
              padding: '10px 14px',
              fontSize: '13px',
              border: '1px solid #1e293b',
              background: '#080c14',
              color: '#f8fafc',
              borderRadius: '8px',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 700,
              color: '#ffffff',
              background: loading || !question.trim() ? '#1e2942' : 'linear-gradient(135deg, #2563eb, #3b82f6)',
              border: 'none',
              cursor: loading || !question.trim() ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.15s ease',
              boxShadow: '0 2px 10px rgba(37, 99, 235, 0.3)',
            }}
          >
            {loading ? (
              <>
                <div style={{
                  width: '14px',
                  height: '14px',
                  border: '2px solid #ffffff',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'dp-spin 0.75s linear infinite',
                }} />
                <span>Reasoning...</span>
              </>
            ) : (
              <span>Ask AI ✨</span>
            )}
          </button>
        </form>

        {/* Suggestion Chips */}
        {suggestions.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', paddingTop: '10px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginRight: '4px' }}>
              Suggestions:
            </span>
            {suggestions.map((s, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setQuestion(s);
                  handleAsk(s);
                }}
                disabled={loading}
                style={{
                  padding: '4px 10px',
                  borderRadius: '99px',
                  fontSize: '11px',
                  background: '#161f32',
                  border: '1px solid #1e293b',
                  color: '#cbd5e1',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#1e2942';
                  e.currentTarget.style.color = '#60a5fa';
                  e.currentTarget.style.borderColor = '#3b82f6';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#161f32';
                  e.currentTarget.style.color = '#cbd5e1';
                  e.currentTarget.style.borderColor = '#1e293b';
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Query Results */}
      {queryResult && (
        <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #1e293b' }}>
          {/* Error Banner */}
          {queryResult.error && (
            <div style={{
              padding: '12px 16px',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px',
              fontSize: '12px',
              color: '#fca5a5',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              marginBottom: '16px',
            }}>
              <span>⚠️</span>
              <div>
                <span style={{ fontWeight: 700 }}>Query Failed:</span> {queryResult.error}
              </div>
            </div>
          )}

          {/* Generated SQL Drawer */}
          {queryResult.sql && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '12px',
                color: '#94a3b8',
                marginBottom: '6px',
              }}>
                <span style={{ fontWeight: 600, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>⚡</span> Generated DuckDB SQL:
                </span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>Validated & Executed In-Memory</span>
              </div>
              <div style={{
                background: '#080c14',
                borderRadius: '8px',
                padding: '12px 16px',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                color: '#34d399',
                border: '1px solid #1e2638',
                overflowX: 'auto',
              }}>
                <code>{queryResult.sql}</code>
              </div>
            </div>
          )}

          {/* High-Impact Hero KPI Display for Single-Row / Aggregation Queries */}
          {queryResult.rows && queryResult.rows.length === 1 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px',
              margin: '12px 0 16px',
            }}>
              {Object.keys(queryResult.rows[0]).map((key) => {
                const val = queryResult.rows![0][key];
                const isNumeric = typeof val === 'number' || (!isNaN(Number(val)) && val !== '' && val !== null);
                return (
                  <div
                    key={key}
                    style={{
                      background: '#0d1322',
                      border: '1px solid #1e293b',
                      borderRadius: '10px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                      {key}
                    </div>
                    <div style={{ fontSize: '32px', fontWeight: 900, color: '#60a5fa', fontFamily: 'monospace', margin: '4px 0' }}>
                      {isNumeric ? Number(val).toLocaleString() : String(val ?? 'null')}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                      Executed in DuckDB RAM
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Auto-generated Interactive Chart with Mobility & Switchers */}
          {queryResult.chartConfig && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '8px' }}>
                Interactive Visualization:
              </div>
              <ChartCard config={queryResult.chartConfig} />
            </div>
          )}

          {/* Raw Tabular Results with Dark Table */}
          {queryResult.rows && queryResult.rows.length > 0 && (
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '8px' }}>
                Result Data ({queryResult.rows.length} rows):
              </div>
              <div style={{
                overflowX: 'auto',
                borderRadius: '8px',
                border: '1px solid #1e293b',
                maxHeight: '260px',
                overflowY: 'auto',
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead style={{ background: '#0d1322', position: 'sticky', top: 0 }}>
                    <tr>
                      {Object.keys(queryResult.rows[0]).map((k) => (
                        <th key={k} style={{
                          padding: '8px 12px',
                          textAlign: 'left',
                          fontWeight: 700,
                          color: '#94a3b8',
                          textTransform: 'uppercase',
                          fontSize: '11px',
                          borderBottom: '1px solid #1e293b',
                        }}>
                          {k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {queryResult.rows.map((row, rIdx) => (
                      <tr key={rIdx} style={{
                        background: rIdx % 2 === 0 ? '#111726' : '#0e1422',
                        borderBottom: '1px solid #1a2234',
                      }}>
                        {Object.keys(row).map((k) => {
                          const val = row[k];
                          const isNum = typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)) && val.trim() !== '');
                          return (
                            <td
                              key={k}
                              style={{
                                padding: '8px 12px',
                                fontFamily: 'monospace',
                                color: isNum ? '#60a5fa' : '#f1f5f9',
                                fontWeight: isNum ? 700 : 400,
                              }}
                            >
                              {val !== null && val !== undefined
                                ? (isNum ? Number(val).toLocaleString() : String(val))
                                : 'null'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
