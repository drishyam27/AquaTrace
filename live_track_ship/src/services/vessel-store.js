/**
 * ShipTrack — Canonical Vessel Store & Track History Service
 */

const {
  MAX_TRACK_POINTS,
  STALE_VESSEL_DEFAULT_MS,
  normalizeVesselType,
  isValidCoordinate
} = require('../config');

class VesselStore {
  constructor() {
    this.vessels = new Map(); // mmsi -> canonical vessel
    this.vesselTracks = new Map(); // mmsi -> historical trajectory points
    this.pendingUpdates = new Set(); // mmsi set of changed vessels
    this.totalUpdates = 0;
    this.lastEventTime = null;
    this.staleTimeoutMs = Number(process.env.VESSEL_STALE_TIMEOUT_MS) || STALE_VESSEL_DEFAULT_MS;
    
    // Start automated stale vessel eviction (runs every 5 minutes)
    this.cleanupInterval = setInterval(() => this.purgeStaleVessels(), 5 * 60 * 1000);
  }

  /**
   * Merge updates from an AIS provider into canonical vessel state
   */
  mergeUpdate(providerName, update) {
    const mmsi = String(update && update.mmsi ? update.mmsi : '');
    if (!mmsi) return null;

    this.lastEventTime = new Date().toISOString();
    this.totalUpdates++;

    const existing = this.vessels.get(mmsi) || { mmsi, sources: [] };
    const merged = { ...existing };

    if (!merged.sources.includes(providerName)) {
      merged.sources.push(providerName);
    }

    const isDynamic = update.latitude != null || update.longitude != null;
    const isNewerPosition = !existing.lastPositionAt
      || (update.lastPositionAt && new Date(update.lastPositionAt) >= new Date(existing.lastPositionAt));

    if (isDynamic && isNewerPosition) {
      if (isValidCoordinate(update.latitude, update.longitude)) {
        merged.latitude = update.latitude;
        merged.longitude = update.longitude;
        merged.lastPositionAt = update.lastPositionAt || existing.lastPositionAt;
        merged.positionSource = providerName;

        if (update.sog != null) merged.sog = update.sog;
        if (update.cog != null) merged.cog = update.cog;
        // AIS Heading: 511 indicates not available
        if (update.heading != null && update.heading !== 511) merged.heading = update.heading;
        if (update.rateOfTurn != null) merged.rateOfTurn = update.rateOfTurn;
        if (update.navigationStatus != null) {
          merged.navigationStatus = update.navigationStatus;
          merged.navigationStatusText = update.navigationStatusText;
        }
        if (update.positionAccuracy != null) merged.positionAccuracy = update.positionAccuracy;
        if (update.raim != null) merged.raim = update.raim;
        if (update.aisClass) merged.aisClass = update.aisClass;
      }
    }

    // Merge static ship metadata
    if (update.name) merged.name = update.name;
    if (update.imo) merged.imo = update.imo;
    if (update.callsign) merged.callsign = update.callsign;
    if (update.vesselType != null) {
      merged.vesselType = update.vesselType;
      const typeInfo = normalizeVesselType(update.vesselType);
      merged.vesselCategory = typeInfo.category;
      merged.vesselColor = typeInfo.color;
    }
    if (update.destination) merged.destination = update.destination;
    if (update.eta) merged.eta = update.eta;
    if (update.draught != null) merged.draught = update.draught;
    if (update.length != null) merged.length = update.length;
    if (update.width != null) merged.width = update.width;

    if (update.lastMessageAt) {
      if (!merged.lastMessageAt || new Date(update.lastMessageAt) >= new Date(merged.lastMessageAt)) {
        merged.lastMessageAt = update.lastMessageAt;
      }
    }

    // Evaluate position freshness
    const positionTime = merged.lastPositionAt;
    const ageMs = positionTime ? Date.now() - new Date(positionTime).getTime() : Infinity;
    if (ageMs < 60000) merged.quality = 'LIVE';
    else if (ageMs < 300000) merged.quality = 'RECENT';
    else if (ageMs < 1800000) merged.quality = 'STALE';
    else merged.quality = 'OFFLINE';

    this.vessels.set(mmsi, merged);

    // Update historical voyage trajectory
    if (isDynamic && isNewerPosition && merged.latitude != null && merged.longitude != null) {
      const track = this.vesselTracks.get(mmsi) || [];
      const lastPoint = track[track.length - 1];
      if (!lastPoint || lastPoint.lat !== merged.latitude || lastPoint.lon !== merged.longitude) {
        track.push({
          lat: merged.latitude,
          lon: merged.longitude,
          sog: merged.sog,
          cog: merged.cog,
          heading: merged.heading,
          time: merged.lastPositionAt
        });
        if (track.length > MAX_TRACK_POINTS) {
          track.splice(0, track.length - MAX_TRACK_POINTS);
        }
        this.vesselTracks.set(mmsi, track);
      }
    }

    this.pendingUpdates.add(mmsi);
    return merged;
  }

  /**
   * Drain pending update queue for batch broadcast
   */
  drainPendingUpdates() {
    if (!this.pendingUpdates.size) return [];
    const changedMmsis = Array.from(this.pendingUpdates);
    this.pendingUpdates.clear();

    const batch = [];
    for (const mmsi of changedMmsis) {
      const vessel = this.vessels.get(mmsi);
      if (vessel) batch.push(vessel);
    }
    return batch;
  }

  /**
   * Get all vessels having valid spatial coordinates
   */
  getVesselsWithPosition() {
    return Array.from(this.vessels.values()).filter(v => v.latitude != null && v.longitude != null);
  }

  /**
   * Get single vessel by MMSI
   */
  getVessel(mmsi) {
    return this.vessels.get(String(mmsi)) || null;
  }

  /**
   * Get historical track for an MMSI
   */
  getTrack(mmsi) {
    const vessel = this.vessels.get(String(mmsi));
    if (!vessel) return null;
    return this.vesselTracks.get(String(mmsi)) || (vessel.latitude != null
      ? [{ lat: vessel.latitude, lon: vessel.longitude, sog: vessel.sog, cog: vessel.cog, heading: vessel.heading, time: vessel.lastPositionAt }]
      : []);
  }

  /**
   * Search vessels by name, MMSI, IMO, callsign, or destination
   */
  search(query, limit = 20) {
    const q = typeof query === 'string' ? query.toLowerCase().trim() : '';
    if (!q) return [];

    return Array.from(this.vessels.values())
      .filter(v => {
        return (
          (v.name && v.name.toLowerCase().includes(q)) ||
          (v.mmsi && v.mmsi.includes(q)) ||
          (v.imo && String(v.imo).includes(q)) ||
          (v.callsign && v.callsign.toLowerCase().includes(q)) ||
          (v.destination && v.destination.toLowerCase().includes(q))
        );
      })
      .slice(0, limit);
  }

  /**
   * Periodically purge expired vessels
   */
  purgeStaleVessels() {
    const cutoff = Date.now() - this.staleTimeoutMs;
    const removed = [];

    for (const [mmsi, vessel] of this.vessels.entries()) {
      const lastTime = vessel.lastPositionAt || vessel.lastMessageAt;
      if (lastTime && new Date(lastTime).getTime() < cutoff) {
        this.vessels.delete(mmsi);
        this.vesselTracks.delete(mmsi);
        removed.push(mmsi);
      }
    }

    return removed;
  }

  getStats(providerConnected = false) {
    return {
      vesselCount: this.vessels.size,
      trackedVesselCount: this.vessels.size,
      totalUpdates: this.totalUpdates,
      lastEventTime: this.lastEventTime,
      aisConnected: providerConnected
    };
  }

  destroy() {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
  }
}

// Export singleton instance
module.exports = new VesselStore();
