# Implementation Notes: AIS Vessel Tracker Refactoring

This document outlines the architectural improvements made to the AIS Vessel Tracker.

## 1. Architecture After Changes

The application has been restructured to explicitly separate data ingestion, state management, and downstream client delivery:
- **Upstream Adapters**: Individual adapters (currently only `AISStreamProvider`) handle connecting to AIS sources, parsing raw messages, and normalizing data into a canonical format.
- **Global Vessel Store**: A central `VesselStore` (the `vessels` Map in `server.js`) tracks the canonical state of all known vessels across all providers.
- **Downstream WebSocket Delivery**: The server tracks each active browser's viewport (`clientViews`) and only broadcasts `VESSEL_UPDATE_BATCH` and `VESSEL_REMOVED` messages relevant to each client's specific bounding box.

## 2. Canonical Vessel Model

All provider adapters emit a strict internal vessel model containing fields like `mmsi`, `latitude`, `longitude`, `sog`, `cog`, `heading`, `lastPositionAt`, `lastMessageAt`, `quality`, and `sources`. This prevents provider-specific logic or nested JSON structures from leaking into the frontend.

## 3. Provider Adapter Design

The architecture introduces the concept of an `AISProvider` (e.g., `AISStreamProvider` class). Adding a future fallback provider only requires instantiating a new class that conforms to the `connect()`, `disconnect()`, `updateSubscription()`, and `normalize()` interfaces. The adapter parses raw data and passes the unified structure to `mergeVesselUpdate()`.

## 4. MMSI Merge Strategy

The `mergeVesselUpdate` function in `server.js` deduplicates vessels by MMSI:
- **Dynamic Data (Position, SOG, COG)**: Only updated if the incoming `lastPositionAt` timestamp is newer than the existing one.
- **Static Data (Name, Dimensions, Destination)**: Existing valid data is preserved; missing fields can be populated by any provider.
- **Tracking**: A `sources` array tracks which providers have contributed data to the vessel, and `positionSource` tracks the provider of the most recent coordinate.

## 5. Viewport Strategy

- **Upstream**: The server merges the bounding boxes of all active WebSocket clients and submits a combined subscription to AISStream using debouncing (2 seconds). This ensures the server only receives data relevant to actual users, saving bandwidth and remaining within API limits.
- **Downstream**: The server calculates intersections before broadcasting. If a vessel leaves a client's specific viewport, a `VESSEL_REMOVED` event is emitted just for that client. Reconnecting clients or clients that move their map receive an immediate `VESSEL_SNAPSHOT`.

## 6. Performance Strategy

- **Backend Batching**: The backend uses an interval (`flushVesselUpdates` at 200ms) to bundle all pending updates into a single `VESSEL_UPDATE_BATCH` array rather than sending hundreds of tiny WebSocket frames.
- **MapLibre Safety**: `addVesselLayer()` in the frontend uses idempotency checks. `text-allow-overlap` was set to `false` for vessel labels to prevent thousands of labels from rendering and degrading WebGL performance at medium zoom levels.

## 7. Stale Cleanup Strategy

The backend runs a periodic cleanup job every 5 minutes. If a vessel's `lastPositionAt` or `lastMessageAt` is older than `VESSEL_STALE_TIMEOUT_MS` (default 2 hours), the vessel is deleted from the global store, and a `VESSEL_REMOVED` event is broadcasted to any client currently tracking it.

## 8. Track-History Limitations

The server maintains a bounded in-memory `vesselTracks` Map (maximum 120 points per MMSI). This is purely recent historical tracking and does not persist across server restarts. The frontend Trails UI leverages this bounded history.

## 9. Security Fixes

- Re-audited the popup and search result DOM generation in `index.html`. The application correctly uses `document.createElement()` and `.textContent` for assigning external data, mitigating Cross-Site Scripting (XSS) risks without relying on unsafe `innerHTML`.

## 10. Known Remaining Limitations

- **AISStream Indian Ocean Coverage**: As documented in `BUG_LOG.md`, AISStream lacks terrestrial receiver coverage in the Indian Ocean. The application correctly renders India vessels if provided by a fallback data source, but AISStream currently returns ~0-1 vessels for the region.
- **Persistence**: Vessel states and historical tracks are kept entirely in memory.
