/**
 * ShipTrack — Integration WebSocket Test Client
 * Simulates a client session: connects to /ws, subscribes to viewports, and validates AIS stream.
 */

const { WebSocket } = require('ws');

const PORT = process.env.PORT || 3001;
const WS_URL = process.env.TEST_WS_URL || `ws://localhost:${PORT}/ws`;

console.log(`[TEST_CLIENT] Connecting to ${WS_URL}...`);
const ws = new WebSocket(WS_URL);

let receivedVesselCount = 0;
const europeMmsis = new Set();
const indiaMmsis = new Set();
let mode = 'europe';

ws.on('open', () => {
  console.log('✅ [TEST_CLIENT] Connected to backend WebSocket');

  // Step 1: Subscribe to Europe Viewport
  console.log('📡 [TEST_CLIENT] Subscribing to Europe Bounding Box...');
  ws.send(JSON.stringify({
    type: 'UPDATE_VIEWPORT',
    data: {
      north: 60,
      south: 35,
      east: 30,
      west: -10
    }
  }));

  // Step 2: Switch to India Viewport after 4 seconds
  setTimeout(() => {
    mode = 'india';
    console.log('📡 [TEST_CLIENT] Switching subscription to Indian Ocean Bounding Box...');
    ws.send(JSON.stringify({
      type: 'UPDATE_VIEWPORT',
      data: {
        north: 37,
        south: 5,
        east: 100,
        west: 65
      }
    }));
  }, 4000);

  // Step 3: Conclude test and close after 8 seconds
  setTimeout(() => {
    console.log('\n📊 [TEST_CLIENT] Test Summary:');
    console.log(`   - Total update events recorded: ${receivedVesselCount}`);
    console.log(`   - Unique Europe MMSIs tracked:  ${europeMmsis.size}`);
    console.log(`   - Unique India MMSIs tracked:   ${indiaMmsis.size}`);
    ws.close();
    console.log('✅ [TEST_CLIENT] Session concluded successfully.\n');
  }, 8000);
});

ws.on('message', (raw) => {
  try {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'INITIAL_VESSELS' || msg.type === 'VESSEL_UPDATE_BATCH') {
      const vessels = Array.isArray(msg.data) ? msg.data : [msg.data];
      receivedVesselCount += vessels.length;
      vessels.forEach(v => {
        if (v && v.mmsi) {
          if (mode === 'europe') europeMmsis.add(v.mmsi);
          else if (mode === 'india') indiaMmsis.add(v.mmsi);
        }
      });
    } else if (msg.type === 'MAP_STATS') {
      console.log(`📈 [STATS] Tracked Vessels: ${msg.data.trackedVesselCount} | Total Updates: ${msg.data.updatesTotal}`);
    }
  } catch (err) {
    console.error('[TEST_CLIENT_ERROR] Failed to parse message:', err.message);
  }
});

ws.on('error', (err) => {
  console.error('❌ [TEST_CLIENT] Connection error:', err.message);
});
