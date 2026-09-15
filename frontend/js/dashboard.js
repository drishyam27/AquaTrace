/**
 * AquaTrace — Dashboard Module
 * Manages the dashboard metric cards and incident alert stream.
 * All data here is static/demo — replace with live API calls when ready.
 */

// ---- Alert Stream ----

const DEMO_ALERTS = [
  {
    severity: 'red',
    id: 'SPILL #1734A - RED SEA',
    time: '04:32 UTC',
    detail: 'High confidence SAR slick match. Vessel AIS trajectory correlation ongoing.',
  },
  {
    severity: 'amber',
    id: 'SPILL #1733B - PERSIAN GULF',
    time: '01:15 UTC',
    detail: 'Possible bilge dumping detected. 2 vessels flagged in proximity.',
  },
  {
    severity: 'green',
    id: 'SPILL #1732C - NORTH SEA',
    time: 'YESTERDAY',
    detail: 'Resolved. Vessel identified, maritime warning letter issued.',
  },
];

const SEVERITY_COLORS = {
  red:   '#ef4444',
  amber: '#f59e0b',
  green: '#10b981',
};

const SEVERITY_TEXT_COLORS = {
  red:   '#dc2626',
  amber: '#d97706',
  green: '#047857',
};

/**
 * Build HTML for a single alert stream item.
 * @param {{ severity: string, id: string, time: string, detail: string }} alert
 * @returns {string}
 */
function renderAlertItem(alert) {
  const borderColor = SEVERITY_COLORS[alert.severity] || '#9ca3af';
  const timeColor   = SEVERITY_TEXT_COLORS[alert.severity] || '#374151';
  return `
    <div style="padding:8px;border-left:4px solid ${borderColor};background:#F6F4EE;">
      <div style="display:flex;justify-content:space-between;font-weight:700;">
        <span>${escapeHTML(alert.id)}</span>
        <span style="color:${timeColor};">${escapeHTML(alert.time)}</span>
      </div>
      <div style="font-size:11px;color:#4b5563;margin-top:4px;">${escapeHTML(alert.detail)}</div>
    </div>
  `;
}

/**
 * Populate the incident alert stream panel.
 */
function renderAlertStream() {
  const container = document.getElementById('alert-stream-container');
  if (!container) return;
  container.innerHTML = DEMO_ALERTS.map(renderAlertItem).join('');
}

// ---- Init ----

/**
 * Initialize the dashboard section: render alert stream.
 * Metric stat card values are in the HTML — they are static for this demo.
 * Called once from app.js.
 */
function initDashboard() {
  renderAlertStream();
}
