/**
 * AquaTrace — Application Configuration
 * Single source of truth for all URLs, endpoints, and constants.
 * Never hardcode these values elsewhere.
 */

const CONFIG = {
  // Node.js live tracking backend
  API_BASE_URL: 'http://localhost:3001/api/v1',
  WS_URL: 'ws://localhost:3001/ws',

  // News RSS proxy (no API key needed)
  NEWS_PROXY_URL: 'https://api.allorigins.win/get?url=',
  NEWS_RSS_URL: 'https://news.google.com/rss/search?q=oil+spill&hl=en&gl=US&ceid=US:en',
  NEWS_REFRESH_MS: 5 * 60 * 1000, // 5 minutes
  NEWS_MAX_ITEMS: 2,

  // Leaflet map defaults
  MAP: {
    DEFAULT_CENTER: [14.300, 42.180],
    DEFAULT_ZOOM: 9,
    TILE_URL: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    TILE_ATTRIBUTION: 'Satellite Imagery &copy; Esri',
    MAX_ZOOM: 17,
  },

  // Leaflet CDN icon paths (required when using CDN — fixes broken default icon)
  LEAFLET_ICONS: {
    iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  },

  // Oil slick polygon style
  SLICK_STYLE: {
    color:       '#00A8E8',
    fillColor:   '#00A8E8',
    fillOpacity: 0.45,
    weight:      3,
  },

  // Vessel track line style
  TRACK_STYLE: {
    color:     '#ef4444',
    weight:    2,
    dashArray: '5, 8',
  },
};
