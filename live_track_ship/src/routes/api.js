/**
 * AquaTrace / ShipTrack — REST API Routes (/api/v1)
 * Routes are thin — all business logic lives in controllers/vesselController.js.
 */

const express          = require('express');
const router           = express.Router();
const vesselController = require('../controllers/vessel-controller');

const path = require('path');
const fs = require('fs');

router.get('/health',                vesselController.getHealth);
router.get('/stats',                 vesselController.getStats);
router.get('/vessels',               vesselController.getVessels);
router.get('/vessels/search',        vesselController.searchVessels);
router.get('/vessels/:mmsi',         vesselController.getVesselByMmsi);
router.get('/vessels/:mmsi/track',   vesselController.getVesselTrack);

// Attribution results from Python scoring engine
router.get('/attribution', (req, res) => {
  const candidatesFile = path.resolve(__dirname, '../../../outputs/attribution/candidates.json');
  if (fs.existsSync(candidatesFile)) {
    return res.sendFile(candidatesFile);
  }
  return res.status(404).json({ error: 'Attribution candidates not found' });
});

module.exports = router;
