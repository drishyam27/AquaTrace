/**
 * AquaTrace — Utility Helpers
 * Small, pure, reusable functions. No DOM access here.
 */

/**
 * Escape a string for safe HTML injection to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHTML(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Format an ISO or RFC-2822 date string into a readable display value.
 * e.g. "15 Sep 2026 · 19:15 UTC"
 * @param {string} dateStr
 * @returns {string}
 */
function formatPubDate(dateStr) {
  if (!dateStr) return 'Date unknown';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return (
    d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) +
    ' UTC'
  );
}

/**
 * Generate a short incident ID from the current date and a sequential index.
 * e.g. "#OS-260901"
 * @param {number} index  0-based position in the list
 * @returns {string}
 */
function makeIncidentId(index) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return `#OS-${yy}${mm}${String(index + 1).padStart(2, '0')}`;
}

/**
 * Extract a geographic location hint from a news headline.
 * Falls back to 'Location TBD' if no known keyword is found.
 * @param {string} title
 * @returns {string}
 */
function extractLocation(title) {
  const keywords = [
    'Gulf', 'Sea', 'Ocean', 'Bay', 'River', 'Coast', 'Port',
    'Pacific', 'Atlantic', 'Arctic', 'Indian', 'Mediterranean',
    'Texas', 'California', 'Alaska', 'Louisiana', 'Nigeria',
    'Russia', 'India', 'China', 'Australia', 'Canada', 'Iran',
    'Red Sea', 'Persian Gulf', 'Black Sea', 'North Sea',
  ];
  for (const kw of keywords) {
    if (title.toLowerCase().includes(kw.toLowerCase())) return kw;
  }
  return 'Location TBD';
}

/**
 * Estimate a plausible oil slick area from title keywords (heuristic).
 * @param {string} title
 * @returns {string}  e.g. "12.4"
 */
function estimateSlickArea(title) {
  const t = title.toLowerCase();
  if (t.includes('major') || t.includes('massive') || t.includes('large'))
    return (Math.random() * 20 + 15).toFixed(1);
  if (t.includes('minor') || t.includes('small'))
    return (Math.random() * 5 + 1).toFixed(1);
  return (Math.random() * 14 + 3).toFixed(1);
}

/**
 * Debounce: delay execution of `fn` until `wait` ms after last call.
 * @param {Function} fn
 * @param {number}   wait  milliseconds
 * @returns {Function}
 */
function debounce(fn, wait) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

/**
 * Truncate a string to maxLen characters and append ellipsis if needed.
 * @param {string} str
 * @param {number} maxLen
 * @returns {string}
 */
function truncate(str, maxLen) {
  if (!str || str.length <= maxLen) return str || '';
  return str.slice(0, maxLen - 1) + '…';
}
