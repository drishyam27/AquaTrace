# System Check — Complete Engineering Audit

**Auditor:** Senior Software Architect + Full-Stack Engineer + Security Reviewer  
**Date:** 2026-09-06  
**Project:** ShipTrack — Live AIS Vessel Tracker  
**Codebase Root:** `AquaTrace`  
**Audit Scope:** FULL — All files, all data paths, all subsystems  
**Code Modified:** NONE — Audit only

---

## 1. Executive Summary

ShipTrack is a real-time ship tracking application powered by AISStream.io. The system consists of a Node.js/Express backend (`server.js`, 545 lines) that ingests live AIS data via WebSocket, and a monolithic single-file frontend (`index.html`, 1575 lines) using MapLibre GL JS for WebGL-accelerated map rendering.

**Overall Assessment:** The application demonstrates solid foundational architecture with competent real-time data handling, but contains **6 CRITICAL bugs**, **9 HIGH bugs**, and numerous medium/low issues. The system is a functional prototype — far from production readiness.

**Production Readiness Score: 22/100**

**Top 3 Risks:**
1. **API key exposed in plaintext** in `.env` and committed (no `.gitignore`).
2. **Unbounded memory growth** — the `vessels` Map and client broadcast payloads grow indefinitely with no upper bound on the server.
3. **`setStyle()` race condition** — basemap switching can permanently lose all vessel layers if the `styledata` event fires before the style is fully loaded.

---

## 2. Project Overview

| Attribute | Value |
|-----------|-------|
| Frontend | Vanilla JS, single HTML file (53.8 KB) |
| Backend | Node.js + Express 5.2.1 |
| Map Engine | MapLibre GL JS 4.7.0 (CDN) |
| Real-time | WebSocket (ws 8.21.3) |
| AIS Source | AISStream.io (WebSocket) |
| Database | None (entirely in-memory) |
| Auth | None |
| Tests | None (test_client.js is a manual debugging script) |
| CI/CD | None |
| Deployment | Manual `node server.js` |
| Lines of Code | ~2,120 (server.js: 545, index.html: 1,575) |
| Dependencies | 4 (express, ws, cors, dotenv) |

### File Inventory
| File | Size | Purpose |
|------|------|---------|
| server.js | 20.1 KB | Backend: AIS ingestion, WebSocket relay, REST API |
| index.html | 53.8 KB | Frontend: Map, UI, state management, all CSS/JS |
| .env | 58 B | API key |
| package.json | 550 B | Dependencies |
| test_client.js | 1.9 KB | Manual test client |
| BUG_LOG.md | 1.9 KB | Known issues |
| IMPLEMENTATION_NOTES.md | 4.5 KB | Architecture notes |
| README.md | 5.1 KB | Project documentation |

---

## 3. Architecture Overview

```
Browser (index.html)
  MapLibre GL JS (WebGL) <-- vessels Map (state) <-- WS Client
  UI (search, panel, filters, status)
         |
         | ws://host:3001/ws
         v
Backend (server.js)
  AISStreamProvider --> mergeVesselUpdate --> vessels Map --> flushUpdates (200ms batch)
  FallbackProvider  (stub - not implemented)
  REST API: /api/v1/health, /stats, /vessels, /vessels/:mmsi
         |
         | wss://stream.aisstream.io/v0/stream
         v
  AISStream.io (Terrestrial AIS)
```

---

## 4. Critical Bugs

### CRITICAL-01: setStyle() race condition causes permanent layer loss
- **Severity:** CRITICAL
- **File:** index.html
- **Function:** `setMapType()`
- **Lines:** 1500-1515
- **What:** Uses `map.once('styledata', ...)` to re-add vessel layers after switching basemaps. The `styledata` event can fire multiple times during a style load and can fire before the style is fully ready (before `load` event).
- **Why it is a bug:** If `addVesselLayer()` runs before the style is fully loaded, `map.addSource()` and `map.addLayer()` may fail silently or throw, leaving vessels permanently invisible until a full page reload. The `addVesselLayer()` function checks `if (map.getSource('vessels')) return;` — if the source was partially added and then removed during style swap, this guard can cause it to skip re-creation entirely.
- **How it can occur:** Click "Map Style" toggle rapidly, or switch from Light to Satellite to Dark quickly. Also triggered on slow network connections where style tile loading is delayed.
- **Current behavior:** Vessels sometimes disappear permanently after switching map type.
- **Expected behavior:** Vessels should always reappear after style change.
- **Recommended fix:** Use `map.once('style.load', ...)` instead of `map.once('styledata', ...)`. Additionally, remove the early-return guard in `addVesselLayer()` and always re-create sources/layers after a style change (since `setStyle()` removes all existing sources and layers).
- **Side effects:** None — this is a strictly better event to listen to.
- **Testing:** Switch map types 10 times rapidly. Verify vessel icons remain visible after every switch.

### CRITICAL-02: Unbounded memory growth on the server — no eviction until 2-hour stale timeout
- **Severity:** CRITICAL
- **File:** server.js
- **Function:** `vessels` Map, `vesselTracks` Map
- **Lines:** 21-22, 462-483
- **What:** The `vessels` Map grows indefinitely as the worldwide AIS subscription feeds data. The stale cleanup only runs every 5 minutes with a 2-hour cutoff (`STALE_VESSEL_MS`). With worldwide subscription (`[[-90, -180], [90, 180]]`), the AISStream feed produces 100k+ vessels. Each vessel object is ~1-2 KB; tracks add ~120 points x ~50 bytes. At 100k vessels, this exceeds 200 MB of RAM.
- **Why it is a bug:** Node.js has a default heap limit (~1.7 GB). Continuous ingestion without upper bounds risks OOM crash, especially when combined with the JSON serialization costs of `INITIAL_VESSELS` payloads.
- **How it can occur:** Leave server running for >1 hour with worldwide subscription.
- **Expected behavior:** Bounded memory usage with configurable max vessel count.
- **Current behavior:** Unbounded growth.
- **Recommended fix:** Add a configurable `MAX_VESSELS` cap. Implement LRU eviction based on `lastMessageAt`. Alternatively, reduce the stale timeout from 2 hours to 15-30 minutes for a worldwide deployment.
- **Side effects:** More aggressive eviction removes vessels that stop transmitting quickly.
- **Testing:** Monitor `process.memoryUsage().heapUsed` over time.

### CRITICAL-03: INITIAL_VESSELS payload can exceed WebSocket frame limits and crash clients
- **Severity:** CRITICAL
- **File:** server.js
- **Function:** `wss.on('connection', ...)`
- **Lines:** 412-419
- **What:** When a client connects, the entire `vessels` Map (up to 100k+ records) is serialized as a single JSON string and sent via one WebSocket message. With 13,000 vessels (observed at runtime), this payload is ~15-25 MB of JSON. At 100k vessels, it exceeds 100 MB.
- **Why it is a bug:** The browser's WebSocket message handler must parse the entire string synchronously via `JSON.parse()`, freezing the UI for seconds. On mobile devices, this can cause the tab to crash. The `ws` library server-side also buffers the entire string in memory before sending.
- **How it can occur:** Any client connection when the server has accumulated >5,000 vessels.
- **Expected behavior:** Chunked delivery of initial data.
- **Current behavior:** Single monolithic JSON payload.
- **Recommended fix:** Chunk the initial vessel dump into batches of 500-1000 vessels, sent as sequential `INITIAL_VESSELS` messages with a small delay between each.
- **Side effects:** Frontend needs to handle multiple `INITIAL_VESSELS` messages (it already does via merge logic).
- **Testing:** Connect to server with 10k+ vessels cached. Monitor browser memory and UI responsiveness during initial load.

### CRITICAL-04: flushVesselUpdates() broadcasts entire vessel objects to ALL clients every 200ms
- **Severity:** CRITICAL
- **File:** server.js
- **Function:** `flushVesselUpdates()`
- **Lines:** 385-407
- **What:** Every 200ms, ALL changed vessel objects are serialized and broadcast to ALL connected clients, regardless of what each client needs. With worldwide ingestion, ~100+ vessels update per 200ms interval. Each update payload serializes the complete vessel object (~1 KB). With 10 connected clients, this is 10 x 100 KB = 1 MB/second of outbound WebSocket traffic per flush.
- **Why it is a bug:** This creates O(clients x updates) network traffic that scales linearly with both dimensions. The previous viewport-based filtering was removed, so there's no longer any server-side fan-out optimization.
- **How it can occur:** Normal operation with >5 clients and worldwide subscription.
- **Expected behavior:** Only send updates relevant to each client's viewport.
- **Current behavior:** Full broadcast of all worldwide updates to every client.
- **Recommended fix:** Restore viewport-based filtering for real-time updates (only sending updates for vessels within each client's current bbox), while keeping the `INITIAL_VESSELS` dump as worldwide. This separates "initial global data" from "ongoing efficient streaming."
- **Side effects:** Re-introduces viewport awareness for streaming updates (not for initial data).
- **Testing:** Monitor WebSocket message sizes with multiple clients connected.

### CRITICAL-05: No .gitignore — API key committed to version control
- **Severity:** CRITICAL
- **File:** Project root
- **What:** There is no `.gitignore` file. The `.env` file containing the API key would be committed to any Git repository. The `node_modules/` directory would also be committed.
- **Why it is a bug:** Secrets in version control are a critical security vulnerability. Even if the repo is private, this key is exposed.
- **How it can occur:** Any `git add .` or `git commit -a` operation.
- **Expected behavior:** `.gitignore` should exclude `.env`, `node_modules/`, and other sensitive/generated files.
- **Current behavior:** No `.gitignore` exists.
- **Recommended fix:** Create `.gitignore` with `.env`, `node_modules/`, `*.log`, etc. Rotate the exposed API key immediately.
- **Side effects:** None.
- **Testing:** Verify `git status` no longer shows `.env` or `node_modules/`.

### CRITICAL-06: addVesselLayer() idempotency guard breaks after style change
- **Severity:** CRITICAL
- **File:** index.html
- **Function:** `addVesselLayer()`
- **Lines:** 975-976
- **What:** The function starts with `if (map.getSource('vessels')) return;`. After `setStyle()`, ALL sources and layers are destroyed by MapLibre. However, if the `styledata` event fires before the internal source registry is fully cleaned, `map.getSource('vessels')` may still transiently return the old (now invalid) source reference, causing the function to bail out without re-creating the vessel layer.
- **Why it is a bug:** This is the complementary issue to CRITICAL-01. The guard assumes sources persist across style changes, but `setStyle()` destroys them.
- **How it can occur:** Switching map types, especially quickly.
- **Expected behavior:** After any style change, layers are always re-created.
- **Current behavior:** Layers can be permanently lost.
- **Recommended fix:** After `setStyle()`, always force-remove old sources before calling `addVesselLayer()`, or remove the early-return guard entirely and use `try/catch` for idempotency.
- **Side effects:** Minor: brief flicker during style transitions.
- **Testing:** Toggle between all 3 map types 20 times rapidly. Count vessel icons visible after each switch.

---

## 5. High Priority Bugs

### HIGH-01: recalculateUpstreamSubscriptions() sends duplicate worldwide bbox alongside client viewports
- **Severity:** HIGH
- **File:** server.js
- **Function:** `recalculateUpstreamSubscriptions()`
- **Lines:** 352-362
- **What:** The function always starts with `[[[-90, -180], [90, 180]]]` (worldwide) and then appends each client's viewport bbox. Since the worldwide bbox already covers the entire planet, adding individual client viewports is redundant and may confuse AISStream's subscription handling.
- **Why it is a bug:** Sending 1 worldwide + N viewport bboxes wastes bandwidth on the AISStream connection and may cause duplicate AIS messages from the provider for overlapping regions.
- **Current behavior:** Subscription includes worldwide + all client viewports (2+ bboxes).
- **Expected behavior:** Either worldwide only (if global mode), OR individual viewports (if viewport mode).
- **Recommended fix:** Send only `[[[-90, -180], [90, 180]]]` without appending client bboxes, since worldwide already subsumes all viewports.

### HIGH-02: WebSocket onerror and onclose can fire simultaneously, triggering double reconnection
- **Severity:** HIGH
- **File:** index.html
- **Function:** `ws.onclose`, `ws.onerror`
- **Lines:** 1147-1155
- **What:** Both `onclose` and `onerror` call `scheduleWsReconnect()`. Per WebSocket spec, `onerror` is always followed by `onclose`. The `scheduleWsReconnect()` function checks `if (wsReconnectTimer) return;` to prevent double-scheduling, but the rapid fire of `onerror` then `onclose` can still cause state confusion.
- **Why it is a bug:** While the guard prevents duplicate timers, `setStatus('RECONNECTING')` is called twice, and the `wsReconnectDelay` is doubled inside `scheduleWsReconnect()` before the timer fires, potentially causing the first reconnect to use 2000ms instead of 1000ms.
- **Expected behavior:** `onerror` should not attempt reconnection since `onclose` will always follow.
- **Recommended fix:** Remove `scheduleWsReconnect()` from `ws.onerror`. Only reconnect from `onclose`.

### HIGH-03: updateMapData() rebuilds entire GeoJSON FeatureCollection on every update
- **Severity:** HIGH
- **File:** index.html
- **Function:** `updateMapData()`
- **Lines:** 1056-1105
- **What:** Every call to `updateMapData()` iterates ALL vessels, creates a new GeoJSON Feature for each, builds a complete FeatureCollection, and passes it to `map.getSource('vessels').setData()`. With 13,000+ vessels, this creates ~13,000 objects on every 200ms flush.
- **Why it is a bug:** JavaScript GC pressure from creating ~13,000 Feature objects + 13,000 geometry objects + 13,000 properties objects every 200ms = ~39,000 objects x 5 times/second = ~195,000 allocations/second. This causes noticeable GC pauses and janky rendering on slower devices.
- **Expected behavior:** Incremental updates or object reuse.
- **Current behavior:** Full rebuild every update cycle.
- **Recommended fix:** Maintain a persistent GeoJSON FeatureCollection and only mutate the coordinates/properties of changed features. Alternatively, increase the throttle from requestAnimationFrame (which is 16ms) to at least 500ms for updateMapData().

### HIGH-04: scheduleMapUpdate() uses requestAnimationFrame which does NOT throttle at the correct granularity
- **Severity:** HIGH
- **File:** index.html
- **Function:** `scheduleMapUpdate()`
- **Lines:** 1219-1228
- **What:** `requestAnimationFrame` fires once per display frame (~16ms at 60fps). Since `VESSEL_UPDATE_BATCH` arrives every 200ms and each batch triggers `scheduleMapUpdate()`, and the `mapUpdatePending` guard only prevents within-frame duplicates, the map is fully redrawn ~5 times per second.
- **Why it is a bug:** Rebuilding 13,000+ GeoJSON features 5 times per second is excessive. The visual difference between 200ms and 1000ms update intervals is imperceptible for ship positions that change every few seconds.
- **Expected behavior:** Throttle map updates to once every 1-2 seconds.
- **Current behavior:** Map is redrawn on every received batch (every 200ms).
- **Recommended fix:** Replace `requestAnimationFrame` with a `setTimeout`-based throttle of 1000-2000ms.

### HIGH-05: normalizeBbox() / vesselInBbox() breaks for antimeridian-crossing bounding boxes
- **Severity:** HIGH
- **File:** server.js
- **Function:** `normalizeBbox()`, `vesselInBbox()`
- **Lines:** 38-52
- **What:** `vesselInBbox()` assumes `bbox[0][1] <= bbox[1][1]` (west <= east), which is false for antimeridian-crossing boxes. Any user viewing the Pacific Ocean with the antimeridian in view will have a bbox like `{west: 170, east: -170}`. After normalization, `bbox = [[south, 170], [north, -170]]`. `vesselInBbox()` then checks `vessel.longitude >= 170 && vessel.longitude <= -170`, which is always false.
- **Current behavior:** No vessels shown when viewing across the antimeridian.
- **Expected behavior:** Vessels on both sides of the antimeridian are shown.
- **Recommended fix:** In `vesselInBbox()`, detect when `bbox[0][1] > bbox[1][1]` (antimeridian crossing) and use OR logic: `vessel.longitude >= west || vessel.longitude <= east`.

### HIGH-06: AIS provider handleDisconnect() sets providerConnected = false globally
- **Severity:** HIGH
- **File:** server.js
- **Function:** `AISStreamProvider.handleDisconnect()`
- **Lines:** 225-228
- **What:** `providerConnected = false` is set in a shared global variable. If the `FallbackProvider` were ever implemented and connected, disconnection of the primary AISStream provider would falsely report all data as unavailable.
- **Current impact:** Low (FallbackProvider is a stub), but HIGH for future extensibility.
- **Recommended fix:** Track connection state per-provider and compute `providerConnected` as `anyConnected()`.

### HIGH-07: mergeVesselUpdate() creates new Date() objects excessively on every AIS message
- **Severity:** HIGH (Performance)
- **File:** server.js
- **Function:** `mergeVesselUpdate()`
- **Lines:** 75, 86, 130, 137
- **What:** Each call creates 2-4 new `Date()` objects. With worldwide AIS ingestion at ~100 messages/second, this is ~400 `Date()` instantiations per second. `new Date(string)` is particularly expensive due to date parsing.
- **Recommended fix:** Use `Date.now()` (returns a number) for comparisons and store timestamps as epoch milliseconds internally.

### HIGH-08: closePanel() calls updateMapData() causing full map rebuild for one property change
- **Severity:** HIGH (Performance)
- **File:** index.html
- **Function:** `closePanel()`
- **Lines:** 1313-1317
- **What:** Closing the vessel detail panel triggers a full `updateMapData()` call (which rebuilds all 13k+ GeoJSON features) just to remove the `selected: 1` highlight from one vessel.
- **Recommended fix:** Use `map.setFeatureState()` to toggle the selected highlight on individual features.

### HIGH-09: Express route ordering makes /api/v1/vessels/search unreachable
- **Severity:** HIGH
- **File:** server.js
- **Lines:** 496-518
- **What:** `GET /api/v1/vessels/search` is defined AFTER `GET /api/v1/vessels/:mmsi`. Express evaluates routes in definition order. A request to `/api/v1/vessels/search` matches `:mmsi` first with `req.params.mmsi = "search"`, returning 404.
- **Current behavior:** Search API endpoint returns 404 "Vessel not found".
- **Expected behavior:** Returns search results.
- **Recommended fix:** Move the `search` route BEFORE the `:mmsi` route.

---

## 6. Medium Priority Bugs

### MED-01: updateStats() shows stale "X seconds ago" and never auto-refreshes
- **File:** index.html, lines 1349-1354
- **What:** The "last update" display is only updated when a `MAP_STATS` message arrives. No interval refreshes the "ago" text.
- **Recommended fix:** Add a `setInterval` that recalculates from a stored timestamp.

### MED-02: vessel-trails line opacity uses expression-literal that bakes false at creation time
- **File:** index.html, lines 1046-1050
- **What:** `['case', ['literal', showTrails], 0.55, 0]` evaluates `showTrails` at definition time (always false). The expression is dead code.
- **Note:** Not a functional bug because `toggleTrails()` uses `setPaintProperty()` to override at runtime.

### MED-03: vessels-labels text-field expression uses baked false literal
- **File:** index.html, line 1023
- **What:** Same issue as MED-02. `['literal', showLabels]` always evaluates to `false`.

### MED-04: test_client.js references VESSEL_SNAPSHOT which is no longer emitted by server
- **File:** test_client.js, line 46
- **What:** Server no longer sends `VESSEL_SNAPSHOT`. Test client misses `INITIAL_VESSELS` messages.

### MED-05: IMPLEMENTATION_NOTES.md describes viewport-based architecture that no longer exists
- **File:** IMPLEMENTATION_NOTES.md, lines 28-30
- **What:** Section 5 describes viewport-based filtering with `VESSEL_REMOVED` events. This was removed.

### MED-06: README.md describes backend/ + frontend/ directory structure that doesn't exist
- **File:** README.md, lines 184-196
- **What:** Shows `shiptracker/backend/` and `shiptracker/frontend/`. Actual project is flat.

### MED-07: README.md references .env.example which does not exist
- **File:** README.md, line 41

### MED-08: No graceful shutdown — server process terminates abruptly
- **File:** server.js
- **What:** No `SIGTERM`/`SIGINT` handler. AIS WebSocket never cleanly closed. Client connections get no close frame.

### MED-09: selectVessel() calls updateMapData() for selection highlight causing full rebuild
- **File:** index.html, line 1261
- **What:** Same root cause as HIGH-08. Selecting a vessel triggers full GeoJSON rebuild.

### MED-10: updatePanel() references fields that never exist on vessel objects
- **File:** index.html, lines 1304-1306
- **What:** `v.sourceMessageType` (never set, always shows dash), `v.lastPositionUpdate` (field is `lastPositionAt`), `v.lastUpdate` (field is `lastMessageAt`), `v.rawMessage` (never set). Technical tab shows all dashes.

---

## 7. Low Priority Issues

### LOW-01: package.json has name "files" which is not descriptive
- **File:** package.json, line 8

### LOW-02: type "commonjs" is redundant (it's the default)
- **File:** package.json, line 20

### LOW-03: server_debug.log is a generated file that should not be tracked

### LOW-04: README.md contains prefix of exposed API key on line 12

### LOW-05: fmtTime() swallows exceptions silently with bare catch
- **File:** index.html, line 1562

### LOW-06: Magic numbers throughout codebase
- 200 (flush interval), 120 (max track points), 700 (viewport debounce), 2000 (subscription debounce), 30000 (max reconnect delay), 511 (AIS heading invalid), 5.5 (label minzoom) — all undocumented.

### LOW-07: Comment on server.js line 23 still says "sentMmsis: Set" but that field was removed
- **File:** server.js, line 23

### LOW-08: Several rail buttons have no functionality
- **File:** index.html, lines 656-661
- "Vessels", "Ports", "Alerts", "History", "Settings" buttons only call `setRailActive(this)`.

---

## 8. Ship/AIS System Audit

### Data Pipeline Trace
```
AISStream.io WebSocket
    |
    v
AISStreamProvider.normalize() [server.js:268-320]
    |
    v
mergeVesselUpdate() [server.js:71-164]
    | (dedup by MMSI, merge static+dynamic, quality scoring)
    v
vessels Map (global store) [server.js:21]
    | (200ms flush interval)
    v
flushVesselUpdates() [server.js:385-405]
    | (VESSEL_UPDATE_BATCH to ALL clients)
    v
Frontend handleServerMessage() [index.html:1168-1217]
    | (merge into frontend vessels Map)
    v
scheduleMapUpdate() -> updateMapData() [index.html:1056-1105]
    | (build GeoJSON FeatureCollection)
    v
MapLibre GL JS (WebGL symbol layer)
    |
    v
User's screen
```

### Audit Findings

| Question | Answer | Evidence |
|----------|--------|----------|
| Is ship data limited by map viewport? | NO (after recent changes) | INITIAL_VESSELS sends all vessels. flushVesselUpdates broadcasts all. |
| Does zoom/pan delete previously loaded ships? | NO (after recent changes) | Frontend merges with spread operator. Never calls vessels.clear(). |
| Is only coastal data being fetched? | YES — Provider limitation | AISStream.io is terrestrial-only. ~40-100nm offshore max. |
| Are open-ocean ships missing? | YES — Provider limitation | CONFIRMED — no S-AIS data. Cannot be fixed without a different API. |
| Is the API capable of worldwide AIS coverage? | Terrestrial only | AISStream.io documentation confirms no satellite receivers. |
| Are API limits handled? | PARTIALLY | No rate limiting on subscription updates. |
| Are duplicate ships created? | NO | MMSI-based dedup in mergeVesselUpdate() and frontend merge logic. CONFIRMED. |
| Are ships incorrectly overwritten? | NO | Static fields preserved unless new data is non-null. CONFIRMED. |
| Is MMSI used correctly? | YES | String(mmsi) normalization. CONFIRMED. |
| Are stale ships removed correctly? | YES with caveat | 5-min interval, 2-hour timeout. May be too long. |
| Are real-time updates merged correctly? | YES | Spread merge on frontend. CONFIRMED. |
| Is dataset stored separately from viewport state? | YES | Frontend vessels Map is independent of map bounds. CONFIRMED. |
| Is browser caching implemented? | NO | No IndexedDB, localStorage, or Service Worker. |
| Could thousands of ships crash the browser? | UNLIKELY | MapLibre handles 100k+ symbols via WebGL. But INITIAL_VESSELS JSON.parse can freeze UI. |
| Is MapLibre rendering scalable? | YES | Uses WebGL symbol layers with SDF icons, not DOM markers. |
| Are markers recreated unnecessarily? | YES | Every updateMapData() rebuilds all GeoJSON features (see HIGH-03). |

### Missing Ship Data Analysis

**Root Cause:** AISStream.io only aggregates terrestrial AIS receivers. Ships in the open ocean are beyond VHF radio range (~40-100nm) of coastal antennas. Mid-ocean tracking requires Satellite AIS (S-AIS), which is a commercial, paid service.

**UNVERIFIED — requires runtime/API/provider verification:**
- Exact coverage map of AISStream.io terrestrial receivers
- Whether the AISStream connection drops or throttles under high message volume from worldwide subscription

---

## 9. Oil Spill Detection Audit

### Finding: NO OIL SPILL DETECTION SYSTEM EXISTS

In the current baseline, there is:
- No satellite image ingestion
- No image preprocessing
- No ML/AI model inference
- No oil spill classification/detection
- No GeoJSON polygon generation for spill boundaries
- No confidence scores
- No spill alerting system
- No historical spill data
- No spill-related API endpoints
- No spill-related UI components

**The application is purely a ship tracking system.** If oil spill detection is a project requirement, it has not been implemented.

**UNVERIFIED — requires stakeholder clarification:**
- Is oil spill detection a required feature for the deployment?

---

## 10. Map/Leaflet Audit

Note: The project uses MapLibre GL JS, not Leaflet.

### Map Initialization
- **File:** index.html:897-945
- **Single instance:** Only one `new maplibregl.Map()` is created. No risk of multiple instances. CONFIRMED.
- **Container:** `#map` is a fixed-position div covering the viewport. Correct.

### Layer Lifecycle
- **CONFIRMED BUG:** addVesselLayer() idempotency guard breaks after setStyle(). See CRITICAL-01, CRITICAL-06.
- **CONFIRMED:** setStyle() destroys all user-added sources and layers. The styledata event is unreliable for re-initialization.

### Tile Layers
- Light: CartoGL Positron — Free, no API key. CONFIRMED.
- Dark: CartoGL Dark Matter — Free, no API key. CONFIRMED.
- Satellite: Esri World Imagery raster tiles — Free public endpoint. CONFIRMED.

### Event Listeners
- `moveend`: Debounced at 700ms. Sends UPDATE_VIEWPORT to backend. CONFIRMED.
- `click` on vessels-icons: Opens detail panel. CONFIRMED.
- `mouseenter` on vessels-icons: Shows popup. CONFIRMED.
- `mouseleave` on vessels-icons: Removes popup. CONFIRMED.
- Event listeners are bound once during initMap() and never cleaned up. Since initMap() is only called once, this is fine.

### Coordinate Systems
- **CONFIRMED BUG:** Antimeridian handling is broken in vesselInBbox(). See HIGH-05.
- Coordinate validation: Both server and client validate [-90, 90] latitude and [-180, 180] longitude. CONFIRMED.
- GeoJSON: Correctly uses [longitude, latitude] order per GeoJSON spec. CONFIRMED.

### Performance
- Rendering: WebGL symbol layer with SDF icon. Correct and efficient for 10k+ points.
- Icon loading: Single SVG icon loaded once, used for all vessels via sdf: true + icon-color paint. CONFIRMED.
- No DOM markers: Correct — DOM markers would be catastrophic at 13k+ vessels.
- Label collision: text-allow-overlap: false prevents label stacking. CONFIRMED.
- Icon collision: icon-allow-overlap: true and icon-ignore-placement: true ensure all vessels are always visible.

### Memory
- No layer leak: Vessel layers created only in addVesselLayer() with idempotency guard. No risk of duplicate layers (except after style change).
- Popup cleanup: `if (popup) popup.remove();` before creating new popup. No popup leak. CONFIRMED.

---

## 11. Frontend Audit

### Architecture Assessment
- **Monolithic:** All 1,575 lines (CSS + HTML + JS) in a single file. Difficult to maintain, test, and navigate.
- **No framework:** Vanilla JS with direct DOM manipulation. Appropriate for project scope but codebase has outgrown it.
- **No component abstraction:** Filter panel, search, detail panel, map controls are all tightly coupled in global scope.
- **No module system:** All functions and state are global variables. No encapsulation.

### State Management
- `vessels` Map: Global. Single source of truth. CONFIRMED.
- `vesselTracks` Map: Global. Maintained in parallel. CONFIRMED.
- `selectedMmsi`: Global. Used for detail panel state. CONFIRMED.
- **Risk:** No state change notifications. UI updates manually triggered.

### Loading/Error States
- Loading overlay: Shows during map initialization. CONFIRMED.
- Error handling: Only catches WebSocket parse errors and map init errors. No user-facing error display for network failures.
- No fallback: If backend unreachable, map loads with no vessels and status shows "CONNECTING" forever.

### Accessibility
- No ARIA labels on any interactive element.
- No keyboard navigation for vessel selection.
- No focus management for the detail panel.
- Color contrast: Muted text colors may fail WCAG AA.
- Emoji icons for UI controls instead of proper icon assets.

### Responsive Design
- Mobile breakpoint at 768px hides left rail and adjusts panel width. CONFIRMED.
- No explicit touch event handling, but MapLibre's built-in touch controls work.

---

## 12. Backend Audit

### API Architecture
- Express 5.2.1 with CORS enabled globally. Acceptable for development.
- All routes in a single file. No router separation.

### Route Analysis

| Endpoint | Issues |
|----------|--------|
| GET /api/v1/health | Correct |
| GET /api/v1/stats | Correct |
| GET /api/v1/vessels | WARNING: Serializes ALL vessels. Can be 10MB+ response. No pagination. |
| GET /api/v1/vessels/search | BUG: Unreachable due to route ordering. See HIGH-09. |
| GET /api/v1/vessels/:mmsi | Correct |
| GET /api/v1/vessels/:mmsi/track | Correct |
| WS /ws | See Real-Time System section |

### Validation
- WebSocket UPDATE_VIEWPORT: normalizeBbox() validates bounds. CONFIRMED.
- REST params: No validation on :mmsi parameter. Minor.
- No input size limits explicitly configured.

### Error Handling
- WebSocket errors: Caught with try/catch, logged. CONFIRMED.
- AIS parse errors: Caught, logged, individual messages skipped. CONFIRMED.
- No global error handler: No `process.on('uncaughtException')` or `process.on('unhandledRejection')`.

### Logging
- Console only. No structured logging.
- No log levels.
- No request logging middleware.

### Rate Limiting
- **None.** Any client can open unlimited WebSocket connections. Any IP can make unlimited REST requests. DOS risk.

---

## 13. Security Audit

### SECRET/KEY DETECTED — location: .env

### Findings

| Finding | Severity | Details |
|---------|----------|---------|
| API key in .env with no .gitignore | CRITICAL | Key will be committed to Git |
| API key prefix in README.md | MEDIUM | Partial key exposure on line 12 |
| CORS: * (allow all origins) | MEDIUM | Any website can call the REST API |
| No authentication | HIGH | All endpoints unauthenticated |
| No authorization | HIGH | No user roles or access control |
| No HTTPS/WSS enforcement | HIGH | All traffic is plaintext |
| No input sanitization for search | LOW | Mitigated by textContent (not innerHTML) |
| XSS in popup content | SAFE | createPopupContent() uses createElement + textContent. CONFIRMED safe. |
| WebSocket has no origin check | MEDIUM | Any website can connect |
| No rate limiting | HIGH | DOS risk |
| CDN dependency (MapLibre) | LOW | unpkg.com CDN — supply chain risk. Prefer self-hosting or SRI hashes. |

---

## 14. Performance Audit

### Frontend Performance

| Issue | Current | Why Slow | Better Approach | Benefit |
|-------|---------|----------|-----------------|---------|
| Full GeoJSON rebuild every 200ms | updateMapData() iterates all vessels | Creates ~39k objects every 200ms | Maintain persistent FeatureCollection, update changed only | 90% GC reduction |
| JSON.parse of INITIAL_VESSELS | Single massive JSON string | 13k vessels = ~15MB JSON. Browser freezes. | Chunk into batches of 500 | Eliminates UI freeze |
| No web worker for data processing | All on main thread | AIS merging competes with rendering | Move merge to Web Worker | Smoother rendering |
| updateVesselCount() iterates all vessels | O(n) on every update | 13k iterations x 5/sec | Maintain running counter | O(1) counts |
| Search iterates all vessels | O(n) linear scan | 13k comparisons per keystroke | Build search index | O(log n) search |

### Backend Performance

| Issue | Current | Why Slow | Better Approach | Benefit |
|-------|---------|----------|-----------------|---------|
| flushVesselUpdates() to all clients | Same payload to everyone | Bandwidth scales with clients | Viewport-based filtering for updates | ~90% bandwidth reduction |
| mergeVesselUpdate() Date objects | new Date(string) per message | Date parsing is expensive at 100+ msg/sec | Use Date.now() epoch ms | ~4x faster timestamps |
| GET /api/v1/vessels returns all | No pagination | Response can be 10MB+ | Add limit/offset pagination | Predictable responses |

---

## 15. Data Flow Problems

### Problem 1: Frontend/Backend vessel count mismatch
- Backend MAP_STATS.vesselCount reports `vessels.size` including vessels without positions.
- Frontend updateVesselCount() only counts vessels with valid coordinates.
- Result: Status bar shows different numbers.

### Problem 2: Frontend track history diverges from backend
- Backend stores tracks with sog, cog, heading, time per point.
- Frontend stores only { lat, lon } per point (line 1188).
- Result: Frontend trail data is less rich.

### Problem 3: updatePanel() references non-existent fields
- `v.sourceMessageType` — never set. Always shows dash.
- `v.lastPositionUpdate` — field is actually `lastPositionAt`. Always shows dash.
- `v.lastUpdate` — field is actually `lastMessageAt`. Always shows dash.
- `v.rawMessage` — never sent by backend. Always shows placeholder.
- Result: Technical tab in detail panel is always empty.

---

## 16. API Problems

### Problem 1: Route ordering makes /api/v1/vessels/search unreachable
- Express matches `:mmsi` before `search`. See HIGH-09.
- Impact: Frontend uses local search (not API), so users are not affected. External API consumers get 404.

### Problem 2: No pagination on GET /api/v1/vessels
- With 13k+ vessels, response is 10MB+. No limit, offset, or cursor parameters.
- Impact: Unusable for external integrations.

### Problem 3: No API documentation or versioning enforcement
- Routes use /api/v1/ prefix which is good, but no formal API docs exist.

---

## 17. Caching Problems

### Problem 1: No browser-side caching
- Frontend vessels Map is entirely in-memory JavaScript. Page refresh loses ALL data.
- Recommended: Use IndexedDB to persist cache across reloads.

### Problem 2: No HTTP caching headers on REST API
- All endpoints return with no Cache-Control, ETag, or Last-Modified.

### Problem 3: No backend-side response caching
- GET /api/v1/vessels serializes the entire Map on every request.

---

## 18. Real-Time System Problems

### Problem 1: No heartbeat/ping mechanism on client WebSocket
- No application-level ping/pong. Stale connections not detected until next message attempt.
- Recommended: Server-side ping every 30 seconds.

### Problem 2: No message ordering guarantee during reconnection
- Reconnecting client receives INITIAL_VESSELS that may be older than last VESSEL_UPDATE_BATCH before disconnection.
- Impact: Brief inconsistency. Self-correcting within 200ms.

### Problem 3: No backpressure handling for slow clients
- If a client's send buffer is full, ws library buffers in memory. Server does not check bufferedAmount.
- Impact: Potential memory leak for slow clients.

---

## 19. Code Quality Issues

### Duplicate Code
1. updateVesselCount() (line 1338-1347) duplicates filter logic from updateMapData() (lines 1066-1067).
2. Coordinate validation duplicated between server (isValidCoordinate) and client (inline in updateMapData).

### Dead Code
1. vessels-labels initial text-field expression (line 1023) — always empty string.
2. vessel-trails initial line-opacity expression (line 1049) — always 0.
3. FallbackProvider class (lines 323-342) — completely stubbed.
4. README.md references to `npm run dev` — no dev script in package.json.

### Unused Variables
1. `geojsonSource` (line 854) — declared but never assigned or used.

### Inconsistent Naming
1. Backend: `vesselCategory`/`vesselColor` vs. Frontend: `VESSEL_COLORS[v.vesselCategory]`. Colors computed twice.
2. Backend field `lastPositionAt` vs. frontend panel reference `lastPositionUpdate` (mismatch).

### Overly Complex Functions
1. `mergeVesselUpdate()` (71-164): 93 lines. Should be split.
2. `updateMapData()` (1056-1105): 49 lines. Handles filtering + GeoJSON + trails. Should be split.

### Huge Files
1. index.html at 1,575 lines is the single biggest maintenance risk.

---

## 20. Architecture Problems

### Problem 1: Monolithic Single-File Frontend
- All CSS, HTML, JS in one file. No modules, no build step, no code splitting.
- Impact: Impossible to unit test. Difficult to maintain.

### Problem 2: No Database — Entirely In-Memory
- Server restart loses ALL data. No historical queries possible.

### Problem 3: Tight coupling between ingestion and serving
- server.js handles AIS connection, normalization, state management, WebSocket relay, AND REST API in one file, one process.
- A bug in AIS parsing can crash the HTTP server.

### Problem 4: No separation between data and presentation
- Frontend vessels Map contains raw backend data mixed with UI state.

### Problem 5: Global mutable state
- Both frontend and backend use global Maps with no access control or change notifications.

---

## 21. Scalability Problems

| Dimension | Current Limit | Bottleneck |
|-----------|--------------|------------|
| Vessels | ~50k before OOM risk | Node.js heap limit |
| Clients | ~10 before bandwidth saturation | Full broadcast to all clients |
| Message rate | ~200 msgs/sec | JSON.parse + mergeVesselUpdate per message |
| REST API | ~5 concurrent for /vessels | Full Map serialization each request |
| Frontend rendering | ~100k vessels | MapLibre can handle, but GeoJSON rebuild is bottleneck |
| Search | ~50k vessels | O(n) linear scan |
| Track history | 120 pts x N vessels in-memory | 50k vessels x 120 points = 6M points |

---

## 22. Production Readiness

### Score: 22/100

| Category | Score | Max | Notes |
|----------|-------|-----|-------|
| Functionality | 8 | 10 | Core features work. Search API broken. |
| Reliability | 3 | 10 | Memory leaks. Race conditions. |
| Security | 1 | 10 | No auth, no rate limiting, key exposed. |
| Performance | 4 | 10 | WebGL good. Everything else unoptimized. |
| Scalability | 2 | 10 | Single process, in-memory, full broadcast. |
| Maintainability | 2 | 10 | Monolithic. No tests. No modules. |
| Testing | 0 | 10 | Zero automated tests. |
| Monitoring | 1 | 10 | Console only. Health endpoint exists. |
| Documentation | 3 | 10 | README outdated. Notes stale. |
| Deployment | 1 | 10 | Manual node server.js. No Docker/CI/CD. |
| **TOTAL** | **22** | **100** | **Prototype quality. Not production-ready.** |

### Score Justification
The application successfully demonstrates a functional real-time ship tracking system with professional-quality UI. However, it lacks every production requirement: authentication, tests, error boundaries, graceful shutdown, database persistence, deployment automation, monitoring, and security hardening.

---

## 23. Recommended Architecture

```
INGESTION LAYER
  AISStream (Terrestrial) + Spire/AISHub (Satellite/Community)
      |
  Normalizer (one per provider)
      |
  Dedup/Merge (MMSI-based)
      |
STORAGE LAYER
  Redis (latest positions) + PostgreSQL+PostGIS (history, spatial) + TimescaleDB (time-series)
      |
API LAYER
  REST API (paginated) + WebSocket Gateway (pub/sub) + Auth (JWT/OAuth)
      |
FRONTEND
  React/Solid (UI state) + MapLibre GL (WebGL map) + IndexedDB (offline cache)
      |
MONITORING
  Prometheus -> Grafana + Sentry (errors) + ELK (logs)
```

**DO NOT IMPLEMENT THIS.** This is a target architecture for reference only.

---

## 24. Improvement Roadmap

### P0 — Critical / Must Fix Immediately

| # | Problem | Solution | Files | Difficulty | Benefit |
|---|---------|----------|-------|------------|---------|
| 1 | API key exposed, no .gitignore | Create .gitignore, rotate key | Root, .env | Easy | Prevents credential theft |
| 2 | Style change race condition | Use style.load event, remove guard | index.html | Easy | Fixes vessel disappearance |
| 3 | INITIAL_VESSELS crashes browsers | Chunk into 500-vessel batches | server.js, index.html | Medium | Eliminates UI freeze |
| 4 | Unbounded memory growth | Add MAX_VESSELS + LRU eviction | server.js | Medium | Prevents OOM crash |

### P1 — High Priority

| # | Problem | Solution | Files | Difficulty | Benefit |
|---|---------|----------|-------|------------|---------|
| 5 | Full broadcast to all clients | Restore viewport filtering for updates | server.js | Medium | 90% bandwidth reduction |
| 6 | GeoJSON full rebuild every 200ms | Throttle to 1-2 seconds | index.html | Medium | Major perf gain |
| 7 | Search API unreachable | Reorder routes | server.js | Easy | Fixes broken endpoint |
| 8 | Antimeridian handling | Add crossing logic | server.js | Easy | Fixes Pacific view |
| 9 | Detail panel empty fields | Fix field name mismatches | index.html | Easy | Fixes broken UI |

### P2 — Medium Priority

| # | Problem | Solution | Files | Difficulty | Benefit |
|---|---------|----------|-------|------------|---------|
| 10 | No browser cache | Add IndexedDB persistence | index.html | Medium | Faster reloads |
| 11 | No graceful shutdown | Add SIGTERM/SIGINT handlers | server.js | Easy | Clean termination |
| 12 | No WebSocket heartbeat | Add ping/pong interval | server.js | Easy | Detect stale connections |
| 13 | Stale documentation | Update README, IMPL_NOTES | Docs | Easy | Accurate docs |
| 14 | No REST pagination | Add limit/offset | server.js | Easy | Usable API |

### P3 — Nice to Have

| # | Problem | Solution | Files | Difficulty | Benefit |
|---|---------|----------|-------|------------|---------|
| 15 | Monolithic frontend | Split with bundler | index.html | Hard | Maintainability |
| 16 | No tests | Add Jest + Playwright | New files | Hard | Reliability |
| 17 | No database | Add PostgreSQL + PostGIS | server.js, new | Hard | Persistence |
| 18 | No authentication | Add JWT auth | Both | Medium | Security |
| 19 | No monitoring | Add Prometheus metrics | server.js | Medium | Observability |

---

## 25. Priority Matrix

```
                IMPACT
           Low          High
       +----------+----------+
 Easy  | LOW-01-08| P0-1,2   |
       | MED-05-07| P1-7,8,9 |
       |          | P2-11-14 |
       +----------+----------+
 Hard  | LOW-06   | P0-3,4   |
       |          | P1-5,6   |
       |          | P3-15-19 |
       +----------+----------+
```

Strategy: Start top-right (easy + high impact), then bottom-right.

---

## 26. Testing Recommendations

### Unit Tests (Jest)
- mergeVesselUpdate.test.js — MMSI dedup, field merging, timestamp logic
- normalizeBbox.test.js — input validation, antimeridian
- vesselInBbox.test.js — coordinate checks, edge cases
- normalizeVesselType.test.js — type code mapping
- normalize.test.js — AISStream message parsing

### Integration Tests
- websocket.test.js — Connect, receive INITIAL_VESSELS, send UPDATE_VIEWPORT
- rest-api.test.js — All REST endpoints including route ordering
- reconnection.test.js — Provider disconnect, reconnect, data continuity

### E2E Tests (Playwright)
- map-loads.spec.js — Map initializes, vessels appear
- search.spec.js — Search input, results, click, fly to vessel
- style-switch.spec.js — Toggle Light/Dark/Satellite, vessels persist
- panel.spec.js — Click vessel, panel opens, data correct
- filter.spec.js — Apply type/speed filter, correct vessels shown

### Performance Tests
- initial-load.js — Time from connect to first paint with 10k vessels
- update-throughput.js — Max updates/second before frame drops
- memory-growth.js — Monitor heap over 1 hour with worldwide data

---

## 27. Final Verdict

**ShipTrack is a competent prototype** that demonstrates strong understanding of real-time data systems, WebGL map rendering, and AIS data handling. The MapLibre GL JS integration is well done, the MMSI-based deduplication is correctly implemented, and the overall user experience is polished and professional.

**However, it is not production-ready.** The critical issues are:
1. **Security:** Exposed API key, no authentication, no rate limiting.
2. **Reliability:** Memory leaks, race conditions on style switching, potential OOM crashes.
3. **Scalability:** Full broadcast to all clients, no database, no pagination.
4. **Testability:** Zero automated tests.
5. **Data coverage:** Terrestrial AIS only — an inherent provider limitation.

**For prototype demo purposes**, the application is functional and visually impressive. For production deployment, the P0 and P1 items in the roadmap must be addressed first.

---

## 28. Files Reviewed

| File | Lines | Fully Reviewed |
|------|-------|----------------|
| server.js | 545 | YES - Complete |
| index.html | 1,575 | YES - Complete |
| package.json | 22 | YES - Complete |
| .env | 1 | YES - Complete |
| test_client.js | 73 | YES - Complete |
| README.md | 197 | YES - Complete |
| IMPLEMENTATION_NOTES.md | 53 | YES - Complete |
| BUG_LOG.md | 19 | YES - Complete |
| .vscode/settings.json | 3 | YES - Complete |
| package-lock.json | — | Dependencies verified |

**Total Lines Reviewed: ~2,488**

---

### Safety Confirmation
- No existing source file was modified.
- No existing code was reformatted.
- No dependencies were changed.
- No configuration was changed.
- ONLY System_CHECK.md was created.
- All findings reference actual file paths and code locations.
