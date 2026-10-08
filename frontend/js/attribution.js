/**
 * AquaTrace — Attribution Module
 * Handles AIS upload, Python backend attribution requests,
 * vessel ranking display, and candidate visualization.
 *
 * [INTEGRATION POINT]: When the Python AIS attribution backend is exposed
 * via a REST API, replace the stub functions below with real fetch() calls
 * to that service.
 */

/**
 * (Future) Submit an AIS CSV file for attribution processing.
 * @param {File}   file         AIS CSV file
 * @param {object} spillParams  { lat, lon, radiusKm, dischargeTime }
 * @returns {Promise<object[]>} Ranked candidate list
 */
async function submitAttributionJob(file, spillParams) {
  // TODO: implement when Python backend exposes a REST endpoint
  throw new Error('[Attribution] Backend API not yet connected.');
}

/**
 * Render the attribution result table with ranked candidates.
 * Currently the table is static HTML in index.html.
 * Call this function with live data to dynamically populate it.
 *
 * @param {object[]} candidates  Ranked candidate objects from Python backend
 */
function renderAttributionTable(candidates) {
  const tbody = document.querySelector('.aq-vessel-table tbody');
  if (!tbody) return;

  tbody.innerHTML = candidates.map((c, i) => {
    const rank = `#${String(i + 1).padStart(2, '0')}`;
    const score = c.score ?? 0;
    const confLabel = score >= 70 ? 'HIGH' : score >= 45 ? 'MED' : 'LOW';
    const confBg = score >= 70 ? '#ef4444' : score >= 45 ? '#fbbf24' : '#e5e7eb';
    const confText = score >= 70 ? '#ffffff' : '#111111';
    const lastPos = c.ais_track?.length
      ? `${c.ais_track[c.ais_track.length - 1].lat.toFixed(1)}° N, ${c.ais_track[c.ais_track.length - 1].lon.toFixed(1)}° E`
      : 'N/A';

    return `
      <tr class="hover:bg-cream transition-colors">
        <td class="p-3 font-bold" data-label="Rank">${escapeHTML(rank)}</td>
        <td class="p-3 font-bold text-darknavy" data-label="Vessel">${escapeHTML(c.vessel_name)}</td>
        <td class="p-3" data-label="IMO/MMSI">${escapeHTML(c.mmsi)}</td>
        <td class="p-3" data-label="Flag">—</td>
        <td class="p-3" data-label="Last AIS Pos">${escapeHTML(lastPos)}</td>
        <td class="p-3" data-label="Speed (kts)">—</td>
        <td class="p-3" data-label="Confidence">
          <span style="background:${confBg};color:${confText};" class="font-bold px-2 py-0.5 border border-stark font-mono text-xs">
            ${score}% ${confLabel}
          </span>
        </td>
        <td class="p-3" data-label="Action">
          <button onclick="openModal()" class="bg-skyblue text-stark px-2.5 py-1 border border-stark font-bold hover:bg-sky-300 font-mono text-xs">DETAILS</button>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Initialize the attribution section.
 * Automatically fetches candidates from backend API if available,
 * falling back gracefully to static demo markup.
 */
async function initAttribution() {
  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}/attribution`);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.candidates) && data.candidates.length > 0) {
        renderAttributionTable(data.candidates);
      }
    }
  } catch (err) {
    console.debug('[AquaTrace] Using static demo attribution table', err);
  }
}
