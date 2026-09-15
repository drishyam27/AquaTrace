/**
 * ShipTrack — WebSocket Broadcasting & Viewport Synchronization Service
 */

const { WebSocket } = require('ws');
const { normalizeBbox } = require('../config');
const vesselStore = require('./vessel-store');
const aisProvider = require('../providers/ais-stream');

class BroadcastService {
  constructor() {
    this.wss = null;
    this.clientViews = new Map(); // clientWs -> { bbox }
    this.viewportDebounce = null;
    this.batchInterval = null;
  }

  /**
   * Initialize broadcaster with WebSocket server instance
   */
  init(wss) {
    this.wss = wss;

    // Flush vessel updates in 200ms batches
    this.batchInterval = setInterval(() => this.flushUpdates(), 200);

    // Register status change listener on AIS provider
    aisProvider.onStatusChange = () => this.broadcastStats();

    // Attach connection handler
    this.wss.on('connection', (clientWs) => this.handleClientConnection(clientWs));
  }

  handleClientConnection(clientWs) {
    this.clientViews.set(clientWs, { bbox: null });

    // Send initial active vessels
    const initialVessels = vesselStore.getVesselsWithPosition();
    this.send(clientWs, {
      type: 'INITIAL_VESSELS',
      data: initialVessels
    });

    // Send provider connection status
    this.send(clientWs, {
      type: 'CONNECTION_STATUS',
      data: {
        status: aisProvider.connected ? 'LIVE' : 'RECONNECTING',
        message: aisProvider.connected ? 'Connected to AIS live stream' : 'Reconnecting to AIS stream...'
      }
    });

    // Send current statistics
    this.send(clientWs, {
      type: 'MAP_STATS',
      data: vesselStore.getStats(aisProvider.connected)
    });

    // Handle inbound client messages
    clientWs.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'UPDATE_VIEWPORT') {
          const bbox = normalizeBbox(msg.data);
          if (!bbox) {
            this.send(clientWs, {
              type: 'ERROR',
              data: { message: 'Invalid viewport coordinates format' }
            });
            return;
          }

          const viewState = this.clientViews.get(clientWs);
          if (viewState) {
            viewState.bbox = bbox;
            this.recalculateUpstreamSubscriptions();
          }
        }
      } catch (e) {
        console.error(`[WS_ERROR] Failed parsing message: ${e.message}`);
      }
    });

    clientWs.on('close', () => {
      this.clientViews.delete(clientWs);
      this.recalculateUpstreamSubscriptions();
    });
  }

  /**
   * Recalculate and update AIS upstream subscription with debouncing
   */
  recalculateUpstreamSubscriptions() {
    if (this.viewportDebounce) clearTimeout(this.viewportDebounce);
    this.viewportDebounce = setTimeout(() => {
      const activeBboxes = [[[-90, -180], [90, 180]]]; // Always include global bounds
      for (const { bbox } of this.clientViews.values()) {
        if (bbox) activeBboxes.push(bbox);
      }
      aisProvider.updateSubscription(activeBboxes);
    }, 2000);
  }

  /**
   * Flush queued updates to all connected browser clients
   */
  flushUpdates() {
    const updates = vesselStore.drainPendingUpdates();
    if (!updates || updates.length === 0) return;

    const payload = JSON.stringify({
      type: 'VESSEL_UPDATE_BATCH',
      data: updates
    });

    for (const [client] of this.clientViews.entries()) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  /**
   * Notify clients of purged stale vessels
   */
  notifyRemovedVessels(mmsiList) {
    if (!mmsiList || mmsiList.length === 0) return;

    for (const mmsi of mmsiList) {
      const payload = JSON.stringify({
        type: 'VESSEL_REMOVED',
        data: { mmsi }
      });

      for (const [client] of this.clientViews.entries()) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      }
    }
  }

  /**
   * Broadcast telemetry stats to all clients
   */
  broadcastStats() {
    if (!this.wss) return;
    const payload = JSON.stringify({
      type: 'MAP_STATS',
      data: vesselStore.getStats(aisProvider.connected)
    });

    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  send(clientWs, message) {
    if (clientWs && clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify(message));
    }
  }

  destroy() {
    if (this.batchInterval) clearInterval(this.batchInterval);
    if (this.viewportDebounce) clearTimeout(this.viewportDebounce);
  }
}

// Export singleton instance
module.exports = new BroadcastService();
