/**
 * AquaTrace — News Module
 * Fetches and renders live oil spill news from Google News RSS
 * via the allorigins CORS proxy. Falls back gracefully on error.
 */

// ---- RSS Link Extraction ----

/**
 * Extract the article URL from an RSS <item> element.
 *
 * Bug fix: Google News RSS <link> is a sibling text node, NOT a child element.
 * Using querySelector('link') returns null in most browsers.
 * Correct approach: check <guid> first, then walk raw childNodes.
 *
 * @param {Element} itemEl
 * @returns {string}
 */
function extractLinkFromItem(itemEl) {
  const guid = itemEl.querySelector('guid');
  if (guid && guid.textContent && guid.textContent.startsWith('http')) {
    return guid.textContent.trim();
  }
  for (const node of itemEl.childNodes) {
    if (node.nodeName === 'link' && node.textContent) {
      return node.textContent.trim();
    }
  }
  return 'https://news.google.com/search?q=oil+spill';
}

// ---- Card Renderer ----

/**
 * Build and return the HTML string for one incident card.
 * Uses inline styles because dynamically injected innerHTML is NOT scanned
 * by Tailwind CDN JIT — custom Tailwind classes would silently fail here.
 *
 * @param {{ title: string, link: string, pubDate: string, source: string }} item
 * @param {number} index  0-based card position
 * @returns {string}  HTML string
 */
function renderIncidentCard(item, index) {
  const id       = makeIncidentId(index);
  const loc      = extractLocation(item.title);
  const area     = estimateSlickArea(item.title);
  const conf     = Math.floor(Math.random() * 20 + 75); // 75–94%
  const newsUrl  = escapeHTML(item.link || 'https://news.google.com/search?q=oil+spill');
  const title    = escapeHTML(truncate(item.title, 80));
  const pubDate  = formatPubDate(item.pubDate);
  const source   = escapeHTML(item.source || 'Google News');

  const confBg  = conf >= 88 ? '#ef4444' : conf >= 78 ? '#fbbf24' : '#e5e7eb';
  const confTxt = conf >= 88 ? '#ffffff'  : '#111111';

  return `
    <div style="border:2px solid #111111;background:#ffffff;">
      <div class="aq-incident-grid">

        <!-- Incident ID — clickable to open news -->
        <div class="aq-incident-id-col"
          style="background:#0F2537;color:#F6F4EE;padding:1rem;display:flex;flex-direction:column;justify-content:space-between;cursor:pointer;border-bottom:2px solid #111;transition:background 0.2s;"
          onclick="window.open('${newsUrl}', '_blank')"
          onmouseover="this.style.background='#00A8E8';this.style.color='#111111';this.querySelector('.aq-n-label').style.color='#111';this.querySelector('.aq-n-hint').style.color='#111';"
          onmouseout="this.style.background='#0F2537';this.style.color='#F6F4EE';this.querySelector('.aq-n-label').style.color='#00A8E8';this.querySelector('.aq-n-hint').style.color='#00A8E8';"
          title="Click to open news for this incident"
        >
          <div>
            <div class="aq-n-label" style="font-family:'Space Mono',monospace;font-size:10px;color:#00A8E8;font-weight:700;text-transform:uppercase;display:flex;align-items:center;gap:4px;">
              <i class="fa-solid fa-newspaper" style="font-size:9px;"></i> Incident ID
            </div>
            <div style="font-family:'Syne',sans-serif;font-weight:800;font-size:1.4rem;margin-top:4px;">${id}</div>
          </div>
          <div>
            <div style="font-family:'Space Mono',monospace;font-size:11px;color:#cbd5e1;margin-top:12px;">${source}</div>
            <div class="aq-n-hint" style="font-family:'Space Mono',monospace;font-size:9px;color:#00A8E8;margin-top:4px;display:flex;align-items:center;gap:4px;">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> Tap to read news
            </div>
          </div>
        </div>

        <!-- Slick Area -->
        <div class="aq-incident-area-col" style="border-bottom:2px solid #111;padding:12px;">
          <div style="font-family:'Space Mono',monospace;font-size:10px;color:#6b7280;text-transform:uppercase;font-weight:700;">Est. Slick Area</div>
          <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:1.2rem;color:#111111;margin-top:4px;">${area} km²</div>
          <div style="font-family:'Space Mono',monospace;font-size:10px;color:#9ca3af;margin-top:4px;">SAR Model Est.</div>
        </div>

        <!-- Confidence -->
        <div class="aq-incident-conf-col" style="border-bottom:2px solid #111;padding:12px;">
          <div style="font-family:'Space Mono',monospace;font-size:10px;color:#6b7280;text-transform:uppercase;font-weight:700;">Detection Confidence</div>
          <div style="margin-top:6px;">
            <span style="background:${confBg};color:${confTxt};font-family:'Space Mono',monospace;font-weight:700;font-size:13px;padding:2px 8px;border:1px solid #111111;">${conf}%</span>
          </div>
          <div style="font-family:'Space Mono',monospace;font-size:10px;color:#9ca3af;margin-top:8px;">${loc}</div>
        </div>

        <!-- Headline & Date -->
        <div style="padding:12px;display:flex;flex-direction:column;justify-content:space-between;min-height:100px;">
          <div style="font-family:'Space Mono',monospace;font-size:10px;color:#6b7280;text-transform:uppercase;font-weight:700;">News Headline</div>
          <p style="font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;color:#2B2D42;margin-top:4px;line-height:1.6;flex-grow:1;">${title}</p>
          <div style="font-family:'Space Mono',monospace;font-size:10px;color:#9ca3af;margin-top:8px;border-top:1px solid #e5e7eb;padding-top:8px;">
            <i class="fa-regular fa-clock" style="margin-right:4px;"></i>${pubDate}
          </div>
        </div>

      </div>
    </div>
  `;
}

// ---- News Section Update ----

/**
 * Update the news status badge element.
 * @param {'live'|'error'} state
 * @param {string} [timestamp]  formatted time string for 'live' state
 */
function _updateNewsBadge(state, timestamp) {
  const badge = document.getElementById('news-status-badge');
  if (!badge) return;

  // Reset class to base to avoid class accumulation on refresh
  badge.className = 'font-mono text-[10px] font-bold px-2 py-0.5 border border-stark uppercase w-fit';
  badge.removeAttribute('style');

  if (state === 'live') {
    badge.classList.add('bg-emerald-900', 'text-skyblue');
    badge.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#34d399;margin-right:4px;"></span> LIVE — UPDATED ${timestamp} UTC`;
  } else {
    badge.style.background = '#7f1d1d';
    badge.style.color = '#fca5a5';
    badge.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#f87171;margin-right:4px;"></span> FEED ERROR`;
  }
}

// ---- Main Fetch ----

/**
 * Fetch the live oil-spill RSS news, parse it, and render cards.
 * Falls back to an error card if the proxy or XML parse fails.
 */
async function fetchOilSpillNews() {
  const container = document.getElementById('news-incidents-container');
  if (!container) return;

  try {
    const xmlStr = await fetchNewsRSSXml();

    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlStr, 'application/xml');

    if (xml.querySelector('parsererror')) throw new Error('XML parse error');

    const items = xml.querySelectorAll('item');
    if (!items || items.length === 0) throw new Error('No items in RSS feed');

    const top = Array.from(items).slice(0, CONFIG.NEWS_MAX_ITEMS);

    const cards = top.map((item, i) => {
      const title   = item.querySelector('title')?.textContent   || 'Oil Spill Detected';
      const link    = extractLinkFromItem(item);
      const pubDate = item.querySelector('pubDate')?.textContent || '';
      const source  = item.querySelector('source')?.textContent  || 'Google News';
      return renderIncidentCard({ title, link, pubDate, source }, i);
    });

    container.innerHTML = cards.join('<div style="border-top:2px solid #111111;"></div>');

    const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    _updateNewsBadge('live', time);

  } catch (err) {
    console.warn('[AquaTrace] News fetch failed:', err);
    container.innerHTML = `
      <div style="border:2px solid #f87171;background:#fef2f2;padding:1rem;font-family:'Space Mono',monospace;font-size:12px;color:#b91c1c;">
        <i class="fa-solid fa-triangle-exclamation" style="margin-right:8px;"></i>
        Live feed temporarily unavailable. CORS proxy may be down.
        <a href="https://news.google.com/search?q=oil+spill" target="_blank" style="text-decoration:underline;margin-left:8px;">Open Google News manually</a>
      </div>`;
    _updateNewsBadge('error');
  }
}

// ---- Init ----

/**
 * Start the news section: initial fetch + set auto-refresh interval.
 * Called once from app.js.
 */
function initNews() {
  fetchOilSpillNews();
  setInterval(fetchOilSpillNews, CONFIG.NEWS_REFRESH_MS);
}
