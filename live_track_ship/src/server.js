/**
 * ShipTrack — Live AIS Vessel Tracker
 * Main Server Entry Point
 */

const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const apiRoutes = require('./routes/api');
const broadcastService = require('./services/broadcast-service');
const aisProvider = require('./providers/ais-stream');

// Initialize Express
const app = express();
app.use(cors());
app.use(express.json());

// Public static assets (MapLibre UI, styles, icons)
const publicDir = path.resolve(__dirname, '../public');
app.use(express.static(publicDir));

// Mount REST API
app.use('/api/v1', apiRoutes);

// Fallback to index.html for SPA client navigation
app.get('{*path}', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/ws')) {
    return next();
  }
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Create HTTP & WebSocket server
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Initialize WebSocket broadcasting service
broadcastService.init(wss);

// Server startup
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\n🚢 ==============================================`);
  console.log(`🚢 ShipTrack Live AIS Server v1.0.0`);
  console.log(`🚢 HTTP & API:    http://localhost:${PORT}`);
  console.log(`🚢 WebSocket:     ws://localhost:${PORT}/ws`);
  console.log(`🚢 Environment:   ${process.env.NODE_ENV || 'development'}`);
  console.log(`🚢 ==============================================\n`);

  // Connect to upstream AIS data provider
  aisProvider.connect();
});

module.exports = { app, server };
