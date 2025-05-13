import { Actor } from 'apify';
import { PlaywrightCrawler, Dataset } from 'crawlee';
import zipRadius from './zipRadius.js';   // helper that returns ZIPs within X mi

await Actor.init();

const {
  location        = '21613',          // start ZIP
  keyword         = 'general contractor',
  maxListings     = 50,               // how many contractors you want
  pageDepth       = 3,                // result pages per ZIP
  radiusMiles     = 15,               // expansion radius
} = await Actor.getInput();

// ---------- 1) build an expanded zip list ----------
const zipList = zipRadius(location, radiusMiles);   // e.g. [21613, 21601, …]

// ---------- 2) queue of search-result pages ----------
const searchRequests = [];
for (const zip of zipList) {
  const url = buildSearchUrl({ zip, keyword });     // site-specific
  for (let p = 1; p <= pageDepth; p++)
    searchRequests.push({ url: url + `?page=${p}`, label: 'LIST' });
}

// result-page crawler → push only profile URLs
const crawler = new PlaywrightCrawler({
  headless: true,
  maxRequestsPerCrawl: searchRequests.length,
  async requestHandler(ctx) {
    const { request, page, log, enqueueLinks } = ctx;

    if (request.label === 'LIST') {
      // wait & scroll so all tiles load
      await ensureTilesLoaded(page);

      // enqueue profile links for DETAIL stage
      await enqueueLinks({
        selector: 'a[href*="/pro/"]',
        transformRequest: req => ({ ...req, label: 'DETAIL' }),
      });
    }

    if (request.label === 'DETAIL') {
      // scrape profile with fallback logic
      const contractor = await scrapeProfile(page);
      await Actor.pushData(contractor);

      // stop early if we already have enough rows
      const count = await Dataset.getItemCount();
      if (count >= maxListings) crawler.autoscaledPool.abort();
    }
  }
});

await crawler.run(searchRequests);
await Actor.exit();

/* ===== helper functions ===== */

function buildSearchUrl({ zip, keyword }) {
  // EXAMPLE Houzz; replace per site
  return `https://www.houzz.com/professionals/${slug(keyword)}/${zip}`;
}

async function ensureTilesLoaded(page) {
  await page.waitForLoadState('networkidle');
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(400);
  }
}

async function scrapeProfile(page) {
  await page.waitForLoadState('networkidle');

  const name =
    (await page.$eval('[data-test="profile-name"]', el => el.textContent).catch(() => null)) ||
    (await page.title());

  const phone =
    (await page.$eval('a[href^="tel:"]', a => a.textContent).catch(() => null));

  const email =
    (await page.$eval('a[href^="mailto:"]', a => a.textContent).catch(() => null));

  /* add more fallbacks … */

  return {
    name, phone, email,
    profileUrl: page.url(),
    location: await page.$eval('.address', el => el.textContent).catch(() => null),
    license: await extractLicense(page),
    source: 'Houzz'
  };
}

function slug(t) { return t.trim().toLowerCase().replace(/\s+/g, '-'); }

async function extractLicense(page) {
  // try meta tag, plain text regex, etc.
  const text = await page.content();
  const m = text.match(/license\s*#?:?\s*([A-Z0-9-]+)/i);
  return m ? m[1] : null;
}
