/**
 * AquaTrace / ShipTrack — Vessel Controller
 * Business logic for all vessel-related REST API endpoints.
 * Routes in routes/api.js delegate here — they contain no logic themselves.
 */

const vesselStore  = require('../services/vessel-store');
const aisProvider  = require('../providers/ais-stream');

/**
 * GET /api/v1/health
 * Server health check and uptime.
 */
exports.getHealth = (req, res) => {
  res.json({
    status:      'ok',
    uptime:      Math.floor(process.uptime()),
    vesselCount: vesselStore.vessels.size,
    timestamp:   new Date().toISOString(),
  });
};

/**
 * GET /api/v1/stats
 * Telemetry and ingestion statistics.
 */
exports.getStats = (req, res) => {
  res.json(vesselStore.getStats(aisProvider.connected));
};

/**
 * GET /api/v1/vessels
 * All active vessels that have a known position.
 */
exports.getVessels = (req, res) => {
  const list = vesselStore.getVesselsWithPosition();
  res.json({ count: list.length, vessels: list });
};

/**
 * GET /api/v1/vessels/search?q=<query>&limit=<n>
 * Search vessels by MMSI, name, IMO, callsign, or destination.
 */
exports.searchVessels = (req, res) => {
  const query  = req.query.q || '';
  const limit  = Math.min(Number(req.query.limit) || 20, 100);
  const results = vesselStore.search(query, limit);
  res.json({ query, count: results.length, results });
};

/**
 * GET /api/v1/vessels/:mmsi
 * Full profile for a single vessel by MMSI.
 */
exports.getVesselByMmsi = (req, res) => {
  const vessel = vesselStore.getVessel(req.params.mmsi);
  if (!vessel) {
    return res.status(404).json({
      error:   'Not Found',
      message: `Vessel with MMSI ${req.params.mmsi} was not found`,
    });
  }
  res.json(vessel);
};

/**
 * GET /api/v1/vessels/:mmsi/track
 * Historical trajectory breadcrumb points for a vessel.
 */
exports.getVesselTrack = (req, res) => {
  const track = vesselStore.getTrack(req.params.mmsi);
  if (!track) {
    return res.status(404).json({
      error:   'Not Found',
      message: `Track for vessel MMSI ${req.params.mmsi} not found`,
    });
  }
  res.json({ mmsi: req.params.mmsi, pointCount: track.length, track });
};
