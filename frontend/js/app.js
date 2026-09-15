/**
 * AquaTrace — Application Entry Point
 * Initializes all modules in order.
 * This is the only script that orchestrates the application startup.
 *
 * Load order in index.html must be:
 *   config.js → utils.js → api.js → map.js → modals.js →
 *   dashboard.js → news.js → attribution.js → app.js
 */

async function initApp() {
  try {
    initModals();
    initMap();
    initDashboard();
    initAttribution();
    initNews();
  } catch (err) {
    console.error('[AquaTrace] App initialization error:', err);
  }
}

document.addEventListener('DOMContentLoaded', initApp);
