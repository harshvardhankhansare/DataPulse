import { useState, useMemo } from 'react';
import type { CSSProperties } from 'react';

// --- Types -------------------------------------------------------------------

export type OutlierItem = {
  rowid: number;
  column: string;
  originalValue: number;
  suggestedValue: number;
  replacementType: 'median' | 'mean';
  lowerBound: number;
  upperBound: number;
};

type OutlierReviewPanelProps = {
  outliers: OutlierItem[];
  onAccept: (outlier: OutlierItem) => void;
  onSkip: (outlier: OutlierItem) => void;
  onAcceptAll: (columnFilter?: string) => void;
  onSkipAll: (columnFilter?: string) => void;
  onClose: () => void;
};

// --- Constants ---------------------------------------------------------------

const mainContainerStyle: CSSProperties = {
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  maxHeight: '60vh',
  background: 'rgba(15, 23, 42, 0.95)',
  backdropFilter: 'blur(16px)',
  borderTop: '1px solid #334155',
  boxShadow: '0 -10px 25px -5px rgba(0, 0, 0, 0.5)',
  zIndex: 1000,
  display: 'flex',
  flexDirection: 'column',
  padding: '16px 24px',
  color: '#f8fafc',
  fontFamily: 'Inter, system-ui, sans-serif',
  animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 14,
};

const headerLeftStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};

const headerRightStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};

const outlierCountStyle = (outlierCount: number): CSSProperties => ({
  fontSize: 12,
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: 12,
  background: outlierCount > 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)',
  color: outlierCount > 0 ? '#f87171' : '#4ade80',
  border: `1px solid ${outlierCount > 0 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(34, 197, 94, 0.4)'}`,
});

const acceptAllButtonStyle: CSSProperties = {
  padding: '6px 14px',
  borderRadius: 6,
  border: 'none',
  background: 'linear-gradient(135deg, #16a34a, #15803d)',
  color: '#ffffff',
  fontWeight: 600,
  fontSize: 12,
  cursor: 'pointer',
  boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
};

const skipAllButtonStyle: CSSProperties = {
  padding: '6px 14px',
  borderRadius: 6,
  border: '1px solid #475569',
  background: '#1e293b',
  color: '#cbd5e1',
  fontWeight: 600,
  fontSize: 12,
  cursor: 'pointer',
};

const closeButtonStyle: CSSProperties = {
  padding: '4px 10px',
  borderRadius: 6,
  border: '1px solid #475569',
  background: 'transparent',
  color: '#94a3b8',
  fontSize: 14,
  cursor: 'pointer',
};

const columnFilterChipsStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  marginBottom: 14,
  flexWrap: 'wrap',
};

const outlierCardsGridStyle: CSSProperties = {
  overflowY: 'auto',
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
  gap: 12,
  paddingRight: 4,
  maxHeight: '40vh',
};

const noOutliersStyle: CSSProperties = {
  padding: 24,
  textAlign: 'center',
  color: '#94a3b8',
  gridColumn: '1 / -1',
};

const outlierCardStyle: CSSProperties = {
  background: '#1e293b',
  borderRadius: 8,
  border: '1px solid #334155',
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const outlierCardHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const outlierColumnStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: '#f1f5f9',
};

const outlierRowIdStyle: CSSProperties = {
  fontSize: 11,
  color: '#64748b',
  fontWeight: 400,
};

const iqrBoundsStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: '#94a3b8',
  background: '#0f172a',
  padding: '2px 6px',
  borderRadius: 4,
  border: '1px solid #334155',
};

const outlierValuesStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  fontSize: 13,
};

const valueBadgeStyle = (): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
});

const valueBadgeLabelStyle: CSSProperties = {
  fontSize: 10,
  color: '#94a3b8',
  textTransform: 'uppercase',
};

const valueBadgeValueStyle = (_color: string, _bg: string): CSSProperties => ({
  fontWeight: 700,
  color: _color,
  background: _bg,
  padding: '2px 6px',
  borderRadius: 4,
  fontFamily: 'monospace',
});

const outlierValueSeparatorStyle: CSSProperties = {
  color: '#64748b',
  fontSize: 14,
};

const outlierActionsStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  marginTop: 4,
};

const acceptButtonStyle: CSSProperties = {
  flex: 1,
  padding: '5px 8px',
  borderRadius: 4,
  border: 'none',
  background: '#16a34a',
  color: '#ffffff',
  fontWeight: 600,
  fontSize: 11,
  cursor: 'pointer',
};

const skipButtonStyle: CSSProperties = {
  padding: '5px 12px',
  borderRadius: 4,
  border: '1px solid #475569',
  background: '#0f172a',
  color: '#94a3b8',
  fontSize: 11,
  cursor: 'pointer',
};

// --- Chip Button -------------------------------------------------------------

function ChipButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  const baseStyle: CSSProperties = {
    padding: '4px 10px',
    borderRadius: 16,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
  };

  const activeStyle: CSSProperties = {
    border: `1px solid #38bdf8`,
    background: 'rgba(56, 189, 248, 0.15)',
    color: '#38bdf8',
  };

  const inactiveStyle: CSSProperties = {
    border: `1px solid #334155`,
    background: '#0f172a',
    color: '#94a3b8',
  };

  return (
    <button
      onClick={onClick}
      style={{ ...baseStyle, ...(active ? activeStyle : inactiveStyle) }}
    >
      {label}
    </button>
  );
}

// --- Value Badge -------------------------------------------------------------

function ValueBadge({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div style={valueBadgeStyle()}>
      <span style={valueBadgeLabelStyle}>{label}</span>
      <span style={valueBadgeValueStyle(color, bg)}>
        {value.toLocaleString()}
      </span>
    </div>
  );
}

// --- Outlier Card -------------------------------------------------------------

function OutlierCard({ item, onAccept, onSkip }: { item: OutlierItem; onAccept: (i: OutlierItem) => void; onSkip: (i: OutlierItem) => void }) {
  return (
    <div style={outlierCardStyle}>
      <div style={outlierCardHeaderStyle}>
        <span style={outlierColumnStyle}>
          {item.column} <span style={outlierRowIdStyle}>(Row #{item.rowid})</span>
        </span>
        <span style={iqrBoundsStyle}>
          IQR Bounds: [{item.lowerBound.toFixed(1)} - {item.upperBound.toFixed(1)}]
        </span>
      </div>

      <div style={outlierValuesStyle}>
        <ValueBadge label="Original" value={item.originalValue} color="#f87171" bg="rgba(239, 68, 68, 0.1)" />
        <span style={outlierValueSeparatorStyle}>?</span>
        <ValueBadge label={`Suggested (${item.replacementType})`} value={item.suggestedValue} color="#4ade80" bg="rgba(34, 197, 94, 0.1)" />
      </div>

      <div style={outlierActionsStyle}>
        <button
          onClick={() => onAccept(item)}
          style={acceptButtonStyle}
        >
          Accept Replace
        </button>
        <button
          onClick={() => onSkip(item)}
          style={skipButtonStyle}
        >
          Skip
        </button>
      </div>
    </div>
  );
}

// --- Main Panel ---------------------------------------------------------------

export default function OutlierReviewPanel({ outliers, onAccept, onSkip, onAcceptAll, onSkipAll, onClose }: OutlierReviewPanelProps) {
  const [selectedColumn, setSelectedColumn] = useState<string>('ALL');

  const columnCounts = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    for (const item of outliers) {
      counts[item.column] = (counts[item.column] ?? 0) + 1;
    }
    return counts;
  }, [outliers]);

  const filteredOutliers = useMemo(
    () => (selectedColumn === 'ALL' ? outliers : outliers.filter(o => o.column === selectedColumn)),
    [outliers, selectedColumn]
  );

  const columnFilterArg = selectedColumn === 'ALL' ? undefined : selectedColumn;
  const hasMultipleColumns = Object.keys(columnCounts).length > 1;

  return (
    <div style={mainContainerStyle}>
      {/* --- Header --- */}
      <div style={headerStyle}>
        <div style={headerLeftStyle}>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#38bdf8' }}>?? Outlier Review Panel</span>
          <span style={outlierCountStyle(outliers.length)}>
            {outliers.length} Outlier{outliers.length === 1 ? '' : 's'} Detected
          </span>
        </div>

        <div style={headerRightStyle}>
          {filteredOutliers.length > 0 && (
            <>
              <button
                onClick={() => onAcceptAll(columnFilterArg)}
                style={acceptAllButtonStyle}
              >
                ? Accept All ({filteredOutliers.length})
              </button>
              <button
                onClick={() => onSkipAll(columnFilterArg)}
                style={skipAllButtonStyle}
              >
                ? Skip All ({filteredOutliers.length})
              </button>
            </>
          )}
          <button
            onClick={onClose}
            title="Close Panel"
            style={closeButtonStyle}
          >
            ?
          </button>
        </div>
      </div>

      {/* --- Column Filter Chips --- */}
      {hasMultipleColumns && (
        <div style={columnFilterChipsStyle}>
          <ChipButton label={`All Columns (${outliers.length})`} active={selectedColumn === 'ALL'} onClick={() => setSelectedColumn('ALL')} />
          {Object.entries(columnCounts).map(([col, count]) => (
            <ChipButton key={col} label={`${col} (${count})`} active={selectedColumn === col} onClick={() => setSelectedColumn(col)} />
          ))}
        </div>
      )}

      {/* --- Outlier Cards Grid --- */}
      <div style={outlierCardsGridStyle}>
        {filteredOutliers.length === 0 ? (
          <div style={noOutliersStyle}>
            ?? No outliers in this view!
          </div>
        ) : (
          filteredOutliers.map(item => (
            <OutlierCard key={`${item.rowid}-${item.column}`} item={item} onAccept={onAccept} onSkip={onSkip} />
          ))
        )}
      </div>
    </div>
  );
}
