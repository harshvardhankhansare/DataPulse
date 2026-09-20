import { ExecutiveBriefing } from './reportingTypes.js';

export function buildStandaloneHtmlReport(
  briefing: ExecutiveBriefing,
  chartImages?: Record<string, string>
): string {
  const images = chartImages || {};
  const imageKeys = Object.keys(images);

  const kpisHtml = briefing.macroKpis
    .map(
      kpi => `
      <div class="kpi-card">
        <div class="kpi-label">${escapeHtml(kpi.label)}</div>
        <div class="kpi-value">${escapeHtml(String(kpi.value))}</div>
        <div class="kpi-desc">${escapeHtml(kpi.description)}</div>
      </div>
    `
    )
    .join('');

  const renderSection = (title: string, subtitle: string, narrative: string, bullets: string[]) => `
    <div class="section-card">
      <div class="section-header">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(subtitle)}</p>
      </div>
      <p class="narrative">${escapeHtml(narrative)}</p>
      <ul class="bullet-list">
        ${bullets.map(b => `<li>${escapeHtml(b)}</li>`).join('')}
      </ul>
    </div>
  `;

  const chartsHtml = imageKeys.length > 0
    ? `
      <div class="section-card">
        <div class="section-header">
          <h3>Visual Analytics & Evidence Deck</h3>
          <p>High-resolution analytical snapshots generated from in-memory DuckDB</p>
        </div>
        <div class="charts-grid">
          ${imageKeys
            .map(
              title => `
            <div class="chart-item">
              <div class="chart-title">${escapeHtml(title)}</div>
              <img src="${images[title]}" alt="${escapeHtml(title)}" class="chart-img" />
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `
    : '';

  const recommendationsHtml = briefing.actionableDecisions
    .map((rec, idx) => `
      <div class="rec-item">
        <span class="rec-number">#${idx + 1}</span>
        <span class="rec-text">${escapeHtml(rec)}</span>
      </div>
    `)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(briefing.title)} — ${escapeHtml(briefing.datasetName)}</title>
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: #111827;
      --border: rgba(255, 255, 255, 0.08);
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #2563eb;
      --accent-glow: rgba(37, 99, 235, 0.2);
      --emerald: #10b981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 40px 24px;
    }
    .container {
      max-width: 1100px;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      border-bottom: 1px solid var(--border);
      padding-bottom: 24px;
      margin-bottom: 32px;
      gap: 16px;
    }
    .badge {
      display: inline-block;
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      margin-bottom: 8px;
    }
    h1 { font-size: 28px; font-weight: 800; color: #fff; letter-spacing: -0.02em; }
    .subtitle { color: var(--text-muted); font-size: 14px; margin-top: 4px; }
    .meta { text-align: right; font-size: 12px; color: var(--text-muted); }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 28px;
    }
    .kpi-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.2);
    }
    .kpi-label { font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: 700; letter-spacing: 0.05em; }
    .kpi-value { font-size: 28px; font-weight: 800; color: #fff; margin: 8px 0 4px; font-family: monospace; }
    .kpi-desc { font-size: 12px; color: #64748b; }
    .hero-summary {
      background: linear-gradient(135deg, rgba(37,99,235,0.08) 0%, rgba(15,23,42,0.95) 100%);
      border: 1px solid rgba(37,99,235,0.3);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 28px;
    }
    .hero-summary h2 { font-size: 18px; margin-bottom: 10px; color: #fff; }
    .hero-summary p { font-size: 14px; color: #cbd5e1; line-height: 1.7; }
    .section-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .section-header h3 { font-size: 17px; font-weight: 700; color: #fff; margin-bottom: 4px; }
    .section-header p { font-size: 12px; color: var(--text-muted); margin-bottom: 16px; }
    .narrative { font-size: 14px; color: #cbd5e1; margin-bottom: 14px; line-height: 1.6; }
    .bullet-list { padding-left: 20px; color: #e2e8f0; font-size: 13px; }
    .bullet-list li { margin-bottom: 8px; }
    .rec-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 12px;
      margin-top: 14px;
    }
    .rec-item {
      background: rgba(255,255,255,0.02);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 8px;
      padding: 14px 16px;
      display: flex;
      gap: 10px;
      font-size: 13px;
      color: #e2e8f0;
      line-height: 1.5;
    }
    .rec-number { color: #38bdf8; font-weight: 800; font-size: 14px; }
    .charts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 20px;
      margin-top: 16px;
    }
    .chart-item {
      background: #090d16;
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 8px;
      padding: 12px;
    }
    .chart-title { font-size: 12px; font-weight: 600; color: #cbd5e1; margin-bottom: 8px; }
    .chart-img { width: 100%; height: auto; border-radius: 4px; display: block; }
    .footer {
      border-top: 1px solid var(--border);
      padding-top: 24px;
      margin-top: 40px;
      display: flex;
      justify-content: space-between;
      color: #64748b;
      font-size: 12px;
      flex-wrap: wrap;
      gap: 12px;
    }
    @media print {
      body { background: #fff; color: #0f172a; padding: 20px; }
      .kpi-card, .section-card, .hero-summary {
        background: #fff; border: 1px solid #cbd5e1; box-shadow: none; color: #0f172a; page-break-inside: avoid;
      }
      h1, .kpi-value, .section-header h3, .hero-summary h2 { color: #0f172a; }
      .narrative, .bullet-list li, .rec-item { color: #334155; }
      .badge { border-color: #059669; color: #059669; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <span class="badge">🛡️ AIR-GAPPED VERIFIED BRIEFING</span>
        <h1>${escapeHtml(briefing.title)}</h1>
        <div class="subtitle">Operational & Strategic Intelligence for <b>${escapeHtml(briefing.datasetName)}</b></div>
      </div>
      <div class="meta">
        <div>Generated: <b>${escapeHtml(briefing.generatedDate)}</b></div>
        <div>Engine: <b>DataPulse Desktop (In-Memory DuckDB)</b></div>
        <div>Integrity Score: <b>${briefing.qualityScore}/100</b></div>
      </div>
    </div>

    <!-- Macro KPIs -->
    <div class="kpi-grid">
      ${kpisHtml}
    </div>

    <!-- Executive Summary -->
    <div class="hero-summary">
      <h2>Executive Summary</h2>
      <p>${escapeHtml(briefing.executiveSummary)}</p>
    </div>

    <!-- Strategic Findings -->
    ${renderSection(
      briefing.strategicFindings.title,
      briefing.strategicFindings.subtitle,
      briefing.strategicFindings.narrative,
      briefing.strategicFindings.bulletPoints
    )}

    <!-- Charts if provided -->
    ${chartsHtml}

    <!-- Operational Variance -->
    ${renderSection(
      briefing.operationalVariance.title,
      briefing.operationalVariance.subtitle,
      briefing.operationalVariance.narrative,
      briefing.operationalVariance.bulletPoints
    )}

    <!-- Action Recommendations -->
    <div class="section-card">
      <div class="section-header">
        <h3>Strategic Action Recommendations</h3>
        <p>Operational directives derived from empirical statistical evidence</p>
      </div>
      <div class="rec-grid">
        ${recommendationsHtml}
      </div>
    </div>

    <!-- Governance & Compliance -->
    ${renderSection(
      briefing.governanceAndPrivacy.title,
      briefing.governanceAndPrivacy.subtitle,
      briefing.governanceAndPrivacy.narrative,
      briefing.governanceAndPrivacy.bulletPoints
    )}

    <div class="footer">
      <div>DataPulse © 2026 — Local Air-Gapped Data Intelligence Platform</div>
      <div>Confidential · For Internal Executive Use Only</div>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
