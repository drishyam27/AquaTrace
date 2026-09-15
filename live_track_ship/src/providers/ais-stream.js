/**
 * ShipTrack — AISStream.io WebSocket Ingestion Provider
 */

const { WebSocket } = require('ws');
const { NAV_STATUS_MAP } = require('../config');
const vesselStore = require('../services/vessel-store');

class AISStreamProvider {
  constructor() {
    this.name = 'aisstream';
    this.socket = null;
    this.reconnectTimer = null;
    this.reconnectDelay = 1000;
    this.connected = false;
    this.activeBboxes = [[[-90, -180], [90, 180]]]; // Default worldwide bounding box
    this.onStatusChange = null; // Callback for status broadcast
  }

  /**
   * Initialize connection to AISStream.io
   */
  connect() {
    if (this.socket) {
      this.socket.terminate();
      this.socket = null;
    }

    const apiKey = process.env.AISSTREAM_API_KEY;
    if (!apiKey) {
      console.warn('⚠️ [AISSTREAM] AISSTREAM_API_KEY environment variable is not defined.');
      console.warn('ℹ️ Please set your key in .env (sign up at https://aisstream.io).');
      return;
    }

    console.log(`📡 [AISSTREAM] Connecting to wss://stream.aisstream.io/v0/stream...`);
    this.socket = new WebSocket('wss://stream.aisstream.io/v0/stream');

    this.socket.on('open', () => {
      console.log(`✅ [AISSTREAM] Connection established.`);
      this.reconnectDelay = 1000;
      this.connected = true;
      if (typeof this.onStatusChange === 'function') this.onStatusChange(true);
      this.sendSubscription();
    });

    this.socket.on('message', (data) => {
      try {
        const raw = JSON.parse(data.toString());
        if (raw.MessageType === 'SubscriptionConfirmation') {
          console.log(`📡 [AISSTREAM] Subscription confirmed.`);
          return;
        }

        const normalized = this.normalize(raw);
        if (normalized) {
          vesselStore.mergeUpdate(this.name, normalized);
        }
      } catch (err) {
        console.error(`[AISSTREAM_PARSE_ERROR] ${err.message}`);
      }
    });

    this.socket.on('close', (code) => {
      console.log(`⚠️ [AISSTREAM] Connection closed with code ${code}`);
      this.handleDisconnect();
    });

    this.socket.on('error', (err) => {
      console.error(`❌ [AISSTREAM_ERROR] ${err.message}`);
      this.handleDisconnect();
    });
  }

  handleDisconnect() {
    this.connected = false;
    if (typeof this.onStatusChange === 'function') this.onStatusChange(false);

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    console.log(`🔄 [AISSTREAM] Reconnecting in ${this.reconnectDelay}ms...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
      this.connect();
    }, this.reconnectDelay);
  }

  /**
   * Update active bounding boxes from client viewports
   */
  updateSubscription(bboxes) {
    const jsonOld = JSON.stringify(this.activeBboxes);
    const jsonNew = JSON.stringify(bboxes);
    if (jsonOld === jsonNew) return;

    this.activeBboxes = bboxes;
    if (this.connected) {
      this.sendSubscription();
    }
  }

  sendSubscription() {
    if (!this.connected || !this.socket) return;
    const subs = this.activeBboxes && this.activeBboxes.length > 0
      ? this.activeBboxes
      : [[[-90, -180], [90, 180]]];

    const subscription = {
      APIKey: process.env.AISSTREAM_API_KEY,
      BoundingBoxes: subs,
      FilterMessageTypes: [
        'PositionReport',
        'ShipStaticData',
        'StandardClassBPositionReport',
        'ExtendedClassBPositionReport',
        'StaticDataReport'
      ]
    };

    this.socket.send(JSON.stringify(subscription));
    console.log(`📡 [AISSTREAM] Subscription updated (${subs.length} bounding boxes)`);
  }

  /**
   * Transform raw AIS message payload into canonical entity format
   */
  normalize(raw) {
    const msgType = raw.MessageType;
    const meta = raw.MetaData || {};
    const msg = raw.Message || {};

    const mmsi = String(meta.MMSI || msg.UserID || '');
    if (!mmsi) return null;

    const update = { mmsi, lastMessageAt: new Date().toISOString() };
    if (meta.ShipName) update.name = meta.ShipName.trim();

    if (
      msgType === 'PositionReport' ||
      msgType === 'StandardClassBPositionReport' ||
      msgType === 'ExtendedClassBPositionReport'
    ) {
      const pos = msg.PositionReport || msg.ClassBPositionReport || msg;
      if (Number.isFinite(Number(pos.Latitude))) update.latitude = Number(pos.Latitude);
      if (Number.isFinite(Number(pos.Longitude))) update.longitude = Number(pos.Longitude);
      if (Number.isFinite(Number(pos.Sog))) update.sog = pos.Sog;
      if (Number.isFinite(Number(pos.Cog))) update.cog = pos.Cog;
      if (Number.isFinite(Number(pos.TrueHeading))) update.heading = pos.TrueHeading;
      if (Number.isFinite(Number(pos.RateOfTurn))) update.rateOfTurn = pos.RateOfTurn;

      if (pos.NavigationalStatus != null) {
        update.navigationStatus = pos.NavigationalStatus;
        update.navigationStatusText = NAV_STATUS_MAP[pos.NavigationalStatus] || 'Unknown';
      }
      if (pos.PositionAccuracy != null) update.positionAccuracy = pos.PositionAccuracy;
      if (pos.Raim != null) update.raim = pos.Raim;
      update.aisClass = msgType === 'PositionReport' ? 'A' : 'B';
      update.lastPositionAt = update.lastMessageAt;
    }

    if (msgType === 'ShipStaticData' || msgType === 'StaticDataReport') {
      const sd = msg.ShipStaticData || msg.StaticDataReport || msg;
      if (sd.Name) update.name = sd.Name.trim();
      if (sd.CallSign) update.callsign = sd.CallSign.trim();
      if (sd.ImoNumber) update.imo = sd.ImoNumber;
      if (sd.Type != null) update.vesselType = sd.Type;
      if (sd.Destination) update.destination = sd.Destination.trim();
      if (Number.isFinite(Number(sd.MaximumStaticDraught))) update.draught = sd.MaximumStaticDraught;
      if (sd.Eta) update.eta = sd.Eta;
      if (sd.Dimension) {
        if (sd.Dimension.A && sd.Dimension.B) update.length = sd.Dimension.A + sd.Dimension.B;
        if (sd.Dimension.C && sd.Dimension.D) update.width = sd.Dimension.C + sd.Dimension.D;
      }
    }

    return update;
  }
}

// Export singleton provider
module.exports = new AISStreamProvider();
