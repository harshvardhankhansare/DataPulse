import { useState, useEffect } from 'react';
import { ActiveFilter } from '@core/analytics/filterTypes';

/* ─── AI status indicator ─────────────────────────────── */

export function AiStatusDot() {
    const [online, setOnline] = useState(false);
    const [model, setModel] = useState('');

    useEffect(() => {
        const check = async () => {
            if (!window.electron?.checkAiStatus) return;
            try {
                const s = await window.electron.checkAiStatus();
                setOnline(s.available);
                setModel(s.modelName || '');
            } catch { }
        };
        check();
        const id = setInterval(check, 20000);
        return () => clearInterval(id);
    }, []);

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: online ? '#16a34a' : '#b45309', fontWeight: 500 }}>
            <span className={`dp-dot ${online ? 'online' : 'offline'}`} />
            {online ? (model || 'LM Studio') : 'AI Offline'}
        </div>
    );
}

/* ─── Section header ───────────────────────────────────── */

export function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
    return (
        <div style={{ marginBottom: 20 }}>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.02em' }}>{title}</h1>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>{subtitle}</p>
        </div>
    );
}

/* ─── Empty state (no dataset loaded) ──────────────────── */

export function EmptyState() {
    return (
        <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            minHeight: 'calc(100vh - 52px)', gap: 12, textAlign: 'center',
            padding: 40,
        }}>
            <div style={{
                width: 56, height: 56, borderRadius: 14,
                background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 4,
            }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                </svg>
            </div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#f8fafc' }}>Load a dataset to begin</h2>
            <p style={{ margin: 0, fontSize: 13, color: '#94a3b8', maxWidth: 380, lineHeight: 1.6 }}>
                Use the <strong>Load File</strong> button in the sidebar or drag and drop files.
                DataPulse will instantly profile, analyze, and visualize your data — entirely offline.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {['.csv', '.xlsx', '.json', '.parquet'].map(ext => (
                    <span key={ext} style={{
                        padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: '#141c2e', border: '1px solid #1e293b', color: '#60a5fa',
                        fontFamily: 'monospace',
                    }}>{ext}</span>
                ))}
            </div>
        </div>
    );
}

/* ─── Loading state ────────────────────────────────────── */

export function LoadingState({ message }: { message: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '32px 0', color: '#64748b', fontSize: 13 }}>
            <span className="dp-spinner" />
            {message}
        </div>
    );
}

/* ─── Empty tab state ──────────────────────────────────── */

export function EmptyTabState({ icon, message }: { icon: string; message: string }) {
    return (
        <div style={{ padding: '48px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>{icon}</div>
            {message}
        </div>
    );
}

/* ─── Active filter banner ─────────────────────────────── */

export function ActiveFilterBanner({
    filter,
    onClear,
}: {
    filter: ActiveFilter;
    onClear: () => void;
}) {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            background: 'linear-gradient(90deg, #161c2d 0%, #0f1422 100%)',
            border: '1px solid #3b82f6',
            borderRadius: 10,
            padding: '12px 18px',
            marginBottom: 16,
            boxShadow: '0 4px 18px rgba(59,130,246,0.18)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>🎯</span>
                <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>Active Drill-Down Filter:</span>
                        <span style={{
                            background: '#3b82f6',
                            color: '#ffffff',
                            padding: '2px 10px',
                            borderRadius: 6,
                            fontFamily: 'monospace',
                            fontSize: 13,
                            fontWeight: 800,
                        }}>
                            {filter.column} = "{String(filter.value)}"
                        </span>
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
                        All charts, distributions, and insights below are synchronized to this subset in real-time.
                    </div>
                </div>
            </div>

            <button
                onClick={onClear}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    color: '#fca5a5',
                    borderRadius: 6,
                    padding: '6px 14px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                }}
            >
                <span>✕</span>
                <span>Clear Filter</span>
            </button>
        </div>
    );
}
