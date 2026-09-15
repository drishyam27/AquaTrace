# ShipTrack — Architecture Overview

## System Design

ShipTrack follows a **hub-and-spoke architecture** where the Node.js backend acts as a central ingestion, deduplication, and distribution hub between the upstream AIS data providers and downstream browser clients.

```
                ┌─────────────────────────────────────────────┐
                │              AISStream.io                   │
                │         (Upstream AIS Provider)             │
                └────────────────┬────────────────────────────┘
                                 │ WSS (upstream)
                                 ▼
┌────────────────────────────────────────────────────────────────┐
│                     Node.js Backend Server                     │
│                                                                │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐ │
│  │  AISStream   │──│  Vessel Store    │──│   Broadcast      │ │
│  │  Provider    │  │  (Dedup/Merge)   │  │   Service        │ │
│  │              │  │                  │  │                  │ │
│  │  normalize() │  │  mergeUpdate()   │  │  flushUpdates()  │ │
│  │  reconnect() │  │  purgeStale()    │  │  broadcastStats()│ │
│  └──────────────┘  └──────────────────┘  └──────────────────┘ │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │                  Express REST API                        │ │
│  │  GET /api/v1/health  │ /stats │ /vessels │ /search │ ... │ │
│  └──────────────────────────────────────────────────────────┘ │
└─────────────┬─────────────────────────┬───────────────────────┘
              │ WS /ws (downstream)     │ HTTP REST /api/v1
              ▼                         ▼
┌──────────────────────────────────────────────────────────┐
│                    Browser Clients                        │
│              (MapLibre GL JS + WebSocket)                 │
└──────────────────────────────────────────────────────────┘
```

## Module Responsibilities

### `src/providers/aisstream.js`
- Maintains persistent WSS connection to AISStream.io
- Exponential backoff auto-reconnection
- Normalizes raw AIS message types into canonical vessel updates
- Dynamically updates upstream bounding box subscription based on client viewports

### `src/services/vesselStore.js`
- Canonical in-memory vessel store (Map<MMSI, VesselRecord>)
- Multi-source deduplication and field-level merge
- Historical track trail management (up to 120 breadcrumb points per vessel)
- Position freshness quality assessment (LIVE / RECENT / STALE / OFFLINE)
- Automated stale vessel eviction (configurable timeout)

### `src/services/broadcastService.js`
- Manages downstream browser WebSocket connections
- Per-client viewport tracking and bounding box subscription
- 200ms batched vessel update flushing
- Stale vessel removal notifications
- Connection status and telemetry broadcasting

### `src/routes/api.js`
- Express Router exposing RESTful vessel data endpoints
- Health check, statistics, vessel listing, search, detail, and track endpoints

### `src/config/constants.js`
- Vessel type classification and color palette
- AIS navigation status code dictionary
- Coordinate validation and bounding box normalization utilities

## Data Model

Each vessel in the store follows this canonical structure:

```json
{
  "mmsi": "211234567",
  "name": "EVER GIVEN",
  "imo": 9811000,
  "callsign": "D5XX1",
  "vesselType": 70,
  "vesselCategory": "Cargo",
  "vesselColor": "#3b82f6",
  "latitude": 51.8934,
  "longitude": 4.3812,
  "sog": 12.4,
  "cog": 185.2,
  "heading": 184,
  "navigationStatus": 0,
  "navigationStatusText": "Under way using engine",
  "destination": "ROTTERDAM",
  "eta": "06-15T14:00",
  "draught": 14.5,
  "length": 400,
  "width": 59,
  "quality": "LIVE",
  "aisClass": "A",
  "sources": ["aisstream"],
  "lastPositionAt": "2026-09-08T20:15:30.000Z",
  "lastMessageAt": "2026-09-08T20:15:30.000Z"
}
```
