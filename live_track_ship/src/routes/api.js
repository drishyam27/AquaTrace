/**
 * AquaTrace / ShipTrack — REST API Routes (/api/v1)
 * Routes are thin — all business logic lives in controllers/vesselController.js.
 */

const express          = require('express');
const router           = express.Router();
const vesselController = require('../controllers/vessel-controller');

router.get('/health',                vesselController.getHealth);
router.get('/stats',                 vesselController.getStats);
router.get('/vessels',               vesselController.getVessels);
router.get('/vessels/search',        vesselController.searchVessels);
router.get('/vessels/:mmsi',         vesselController.getVesselByMmsi);
router.get('/vessels/:mmsi/track',   vesselController.getVesselTrack);

module.exports = router;
