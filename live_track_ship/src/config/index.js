/**
 * ShipTrack — Configuration Constants & Enums
 */

// Bounding box and coordinate thresholds
const MAX_TRACK_POINTS = 120;
const STALE_VESSEL_DEFAULT_MS = 2 * 60 * 60 * 1000; // 2 hours

// Vessel classification mapping and UI color palette
const VESSEL_TYPES = {
  SAR: { category: 'SAR', color: '#06b6d4', label: 'Search and Rescue' },
  Cargo: { category: 'Cargo', color: '#3b82f6', label: 'Cargo Vessel' },
  Tanker: { category: 'Tanker', color: '#ef4444', label: 'Tanker' },
  Passenger: { category: 'Passenger', color: '#8b5cf6', label: 'Passenger / Cruise' },
  Fishing: { category: 'Fishing', color: '#f97316', label: 'Fishing Vessel' },
  Tug: { category: 'Tug', color: '#eab308', label: 'Tug / Towing' },
  Military: { category: 'Military', color: '#a855f7', label: 'Military Ops' },
  Pleasure: { category: 'Pleasure', color: '#ec4899', label: 'Pleasure Craft / Yacht' },
  Pilot: { category: 'Pilot', color: '#f59e0b', label: 'Pilot Vessel' },
  Unknown: { category: 'Unknown', color: '#22c55e', label: 'Unknown / Unspecified' },
  Other: { category: 'Other', color: '#94a3b8', label: 'Other Special Craft' }
};

function normalizeVesselType(typeCode) {
  if (typeCode == null) return VESSEL_TYPES.Unknown;
  const t = Number(typeCode);
  if (t === 51 || t === 61) return VESSEL_TYPES.SAR;
  if (t >= 70 && t <= 79) return VESSEL_TYPES.Cargo;
  if (t >= 80 && t <= 89) return VESSEL_TYPES.Tanker;
  if (t >= 60 && t <= 69) return VESSEL_TYPES.Passenger;
  if (t === 30) return VESSEL_TYPES.Fishing;
  if (t === 52) return VESSEL_TYPES.Tug;
  if (t === 35) return VESSEL_TYPES.Military;
  if (t >= 36 && t <= 39) return VESSEL_TYPES.Pleasure;
  if (t === 50) return VESSEL_TYPES.Pilot;
  return VESSEL_TYPES.Other;
}

// AIS Navigation Status Codes (ITU-R M.1371)
const NAV_STATUS_MAP = {
  0: 'Under way using engine',
  1: 'At anchor',
  2: 'Not under command',
  3: 'Restricted manoeuvrability',
  4: 'Constrained by draught',
  5: 'Moored',
  6: 'Aground',
  7: 'Engaged in fishing',
  8: 'Under way sailing',
  9: 'Reserved (HSC)',
  10: 'Reserved (WIG)',
  11: 'Power-driven vessel towing astern',
  12: 'Power-driven vessel pushing ahead or towing alongside',
  13: 'Reserved for future use',
  14: 'AIS-SART (active)',
  15: 'Undefined / Default'
};

function isValidCoordinate(latitude, longitude) {
  return Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))
    && Number(latitude) >= -90 && Number(latitude) <= 90
    && Number(longitude) >= -180 && Number(longitude) <= 180;
}

function normalizeBbox(data) {
  const north = Number(data && data.north);
  const south = Number(data && data.south);
  const east = Number(data && data.east);
  const west = Number(data && data.west);
  if (![north, south, east, west].every(Number.isFinite)) return null;
  if (north < south || north < -90 || south > 90 || east < -180 || west > 180) return null;
  return [[Math.max(-90, south), Math.max(-180, west)], [Math.min(90, north), Math.min(180, east)]];
}

function vesselInBbox(vessel, bbox) {
  return isValidCoordinate(vessel.latitude, vessel.longitude)
    && vessel.latitude >= bbox[0][0] && vessel.latitude <= bbox[1][0]
    && vessel.longitude >= bbox[0][1] && vessel.longitude <= bbox[1][1];
}

module.exports = {
  MAX_TRACK_POINTS,
  STALE_VESSEL_DEFAULT_MS,
  VESSEL_TYPES,
  normalizeVesselType,
  NAV_STATUS_MAP,
  isValidCoordinate,
  normalizeBbox,
  vesselInBbox
};
