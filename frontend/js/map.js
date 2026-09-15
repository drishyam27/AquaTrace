/**
 * AquaTrace — Map Module
 * Handles all Leaflet map initialization, layer rendering,
 * vessel marker management, and the fullscreen overlay toggle.
 *
 * [LIVE_DATA_HOOK]: getVesselData() currently returns hardcoded demo values.
 * Once the Node.js backend is running, replace it with:
 *
 *   async function getVesselData() {
 *     return fetchVessels(); // from api.js
 *   }
 *
 * renderMapLayer() already consumes whatever shape getVesselData() returns.
 * No other code needs to change.
 */

// Module-level map instances
let _map = null;
let _mapFull = null;

// ---- Leaflet Icon Fix ----
// Paths break when Leaflet loads via CDN — must be set manually.
function _fixLeafletIcons() {
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions(CONFIG.LEAFLET_ICONS);
}

// ---- Data Source ----

/**
 * Returns vessel and oil slick data.
 * Currently returns hardcoded demo values.
 * Replace body with `return fetchVessels();` when backend is live.
 *
 * @returns {Promise<{oilSlick: object, vessels: object[]}>}
 */
async function getVesselData() {
  // DEMO DATA — remove once /api/v1/vessels is live
  return {
    oilSlick: {
      coords: [
        [14.35, 42.10],
        [14.38, 42.15],
        [14.32, 42.25],
        [14.28, 42.20],
        [14.30, 42.12],
      ],
      areaKm2: 14.5,
      sensor: 'Sentinel-1',
    },
    vessels: [
      {
        name: 'MV SEAMARINER',
        imo: '9876543',
        matchScore: 94,
        position: [14.31, 42.19],
        track: [
          [14.25, 42.05],
          [14.30, 42.12],
          [14.31, 42.19],
          [14.35, 42.28],
        ],
      },
    ],
  };
}

// ---- Layer Rendering ----

/**
 * Render oil slick polygon and vessel markers onto a Leaflet map instance.
 * @param {L.Map} mapInstance
 */
async function renderMapLayer(mapInstance) {
  const data = await getVesselData();

  // Oil slick polygon
  const slickPolygon = L.polygon(data.oilSlick.coords, CONFIG.SLICK_STYLE).addTo(mapInstance);
  slickPolygon.bindPopup(
    `<b>OIL SLICK DETECTED</b><br>Area: ${data.oilSlick.areaKm2} sq. km<br>SAR Sensor: ${data.oilSlick.sensor}`
  );

  // Vessel markers + AIS track lines
  data.vessels.forEach((v) => {
    const marker = L.marker(v.position).addTo(mapInstance);
    marker.bindPopup(
      `<b>${v.name}</b><br>IMO: ${v.imo}<br>Match Score: <span style='color:red;font-weight:bold;'>${v.matchScore}%</span>`
    );

    L.polyline(v.track, CONFIG.TRACK_STYLE).addTo(mapInstance);
  });
}

// ---- Map Factory ----

/**
 * Create and return a new Leaflet map instance on the given element ID.
 * @param {string} elementId
 * @returns {L.Map}
 */
function createMap(elementId) {
  const m = L.map(elementId).setView(CONFIG.MAP.DEFAULT_CENTER, CONFIG.MAP.DEFAULT_ZOOM);
  L.tileLayer(CONFIG.MAP.TILE_URL, {
    attribution: CONFIG.MAP.TILE_ATTRIBUTION,
    maxZoom: CONFIG.MAP.MAX_ZOOM,
  }).addTo(m);
  renderMapLayer(m);
  return m;
}

// ---- Fullscreen Overlay ----

/**
 * Toggle the fullscreen map overlay open/closed.
 * Lazily initializes the fullscreen map on first open.
 */
function toggleFullscreenMap() {
  const overlay = document.getElementById('fullscreen-map-overlay');
  overlay.classList.toggle('is-open');

  if (overlay.classList.contains('is-open')) {
    if (!_mapFull) {
      _mapFull = createMap('map-full');
    }
    // Allow DOM to paint before invalidating size
    setTimeout(() => _mapFull.invalidateSize(), 100);
  }
}

// ---- Init ----

/**
 * Initialize the primary dashboard map.
 * Called once from app.js on DOMContentLoaded.
 */
function initMap() {
  _fixLeafletIcons();
  _map = createMap('map');

  // Wire fullscreen button — avoids inline onclick in HTML
  document.getElementById('btn-fullscreen-map')?.addEventListener('click', toggleFullscreenMap);
  document.getElementById('btn-close-fullscreen')?.addEventListener('click', toggleFullscreenMap);
  document.getElementById('btn-live-ais-radar')?.addEventListener('click', toggleFullscreenMap);
}
