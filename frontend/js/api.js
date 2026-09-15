/**
 * AquaTrace — API Client
 * Centralizes all HTTP fetch calls to the Node.js backend.
 * Swap CONFIG.API_BASE_URL in config.js to point at a different server.
 */

/**
 * Fetch all active vessels with positions from the live-tracking backend.
 * @returns {Promise<{count: number, vessels: object[]}>}
 */
async function fetchVessels() {
  const res = await fetch(`${CONFIG.API_BASE_URL}/vessels`);
  if (!res.ok) throw new Error(`fetchVessels: HTTP ${res.status}`);
  return res.json();
}

/**
 * Search vessels by name, MMSI, IMO, callsign, or destination.
 * @param {string} query
 * @param {number} [limit=20]
 * @returns {Promise<{query: string, count: number, results: object[]}>}
 */
async function searchVessel(query, limit = 20) {
  const params = new URLSearchParams({ q: query, limit });
  const res = await fetch(`${CONFIG.API_BASE_URL}/vessels/search?${params}`);
  if (!res.ok) throw new Error(`searchVessel: HTTP ${res.status}`);
  return res.json();
}

/**
 * Fetch server health status.
 * @returns {Promise<{status: string, uptime: number, vesselCount: number}>}
 */
async function fetchHealth() {
  const res = await fetch(`${CONFIG.API_BASE_URL}/health`);
  if (!res.ok) throw new Error(`fetchHealth: HTTP ${res.status}`);
  return res.json();
}

/**
 * Fetch the Google News RSS feed for oil spill news via allorigins proxy.
 * Returns the raw RSS XML string.
 * @returns {Promise<string>}
 */
async function fetchNewsRSSXml() {
  const url = CONFIG.NEWS_PROXY_URL + encodeURIComponent(CONFIG.NEWS_RSS_URL);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetchNewsRSSXml: proxy HTTP ${res.status}`);
  const json = await res.json();
  if (!json.contents) throw new Error('fetchNewsRSSXml: empty proxy response');
  return json.contents;
}
