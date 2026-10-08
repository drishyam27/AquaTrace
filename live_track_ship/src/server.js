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

// Static directories
const publicDir = path.resolve(__dirname, '../public');
const frontendDir = path.resolve(__dirname, '../../frontend');
const docsDir = path.resolve(__dirname, '../../docs');

// Mount routes
app.use('/aquatrace', express.static(frontendDir));
app.use('/tracker', express.static(publicDir));
app.use('/attribution-report', express.static(path.resolve(docsDir, 'ais-attribution')));
app.use(express.static(frontendDir));
app.use(express.static(publicDir));

// Mount REST API
app.use('/api/v1', apiRoutes);

// Fallback to index.html for SPA client navigation
app.get('{*path}', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/ws')) {
    return next();
  }
  if (req.path.startsWith('/tracker')) {
    return res.sendFile(path.join(publicDir, 'index.html'));
  }
  res.sendFile(path.join(frontendDir, 'index.html'));
});

// Create HTTP & WebSocket server
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Initialize WebSocket broadcasting service
broadcastService.init(wss);

// Server startup
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\n🌊 ==============================================`);
  console.log(`🌊 AquaTrace & ShipTrack Server ONLINE`);
  console.log(`🌊 Main Portal:        http://localhost:${PORT}`);
  console.log(`🌊 Live Radar:         http://localhost:${PORT}/tracker`);
  console.log(`🌊 Attribution Report: http://localhost:${PORT}/attribution-report/ais-attribution.html`);
  console.log(`🌊 REST API:           http://localhost:${PORT}/api/v1/health`);
  console.log(`🌊 WebSocket:          ws://localhost:${PORT}/ws`);
  console.log(`🌊 Environment:        ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌊 ==============================================\n`);

  // Connect to upstream AIS data provider
  aisProvider.connect();
});

module.exports = { app, server };
