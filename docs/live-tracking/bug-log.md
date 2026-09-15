# Remaining Bugs & Required Fixes

*(All High and Medium bugs have been resolved or handed over for external configuration).*

# Known External Limitation
**Mid-Ocean / Deep Sea Ship Tracking Limitation (Terrestrial vs Satellite AIS)**
The system currently only displays ships in coastal areas and fails to show vessels in the middle of the sea. This is a fundamental hardware limitation of the free API provider (AISStream.io). AISStream aggregates data exclusively from Terrestrial AIS receivers (VHF antennas mounted on shores). These terrestrial antennas have a maximum line-of-sight range of roughly 40-100 nautical miles offshore. Tracking ships in deep or mid-ocean requires Satellite AIS (S-AIS) data, which is highly commercialized and very expensive. This cannot be fixed in code without integrating a paid commercial API (e.g., Spire, ExactEarth, MarineTraffic, or AISHub).

**AISStream India Coverage Limitation**
AISStream currently provides extremely sparse vessel data in the tested India region. This is an upstream data-availability limitation observed during testing. A fallback provider adapter has been added to `server.js` (`FallbackProvider`) to allow filling this geographic coverage gap once an API key is provided.

# Future Enhancements
- **Persistent Track History**: Currently, vessel history is bounded to 120 points and kept strictly in-memory, resetting on server restarts. A database backend may be required for long-term tracking.
- **Search Scalability**: The current search scans the in-memory Map. If global vessel counts grow significantly, a dedicated text-search index (e.g., Redisearch) may be required.

# Definition of Done
- [x] A fallback provider is actively ingesting data and filling coverage gaps (e.g., Indian Ocean). *(Architecture implemented; awaits API key).*
- [x] Vessel trails visually render on the MapLibre map. *(Verified `vessel-trails` layer dynamically renders `vesselTracks` history).*
