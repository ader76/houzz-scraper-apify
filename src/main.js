/*  src/main.js  – Houzz contractor list scraper
 *  – no external helpers
 *  – pushes: name · location · profileUrl  (phone/email left null)
 */
import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

/* ── INPUT ───────────────────────────────────────────── */
const {
    location  = 'Cambridge, MD',        // city, state  or  ZIP
    keyword   = 'general contractor',   // trade
    maxPages  = 1                       // how many result-pages to crawl
} = await Actor.getInput();

/* ── BUILD Houzz URL ───────────────────────────────────
 *  Keyword  “general contractor”  -> “general-contractor”
 *  Location “Cambridge, MD”       -> “Cambridge--MD”
 */
const kwSlug  = keyword.trim().toLowerCase().replace(/\s+/g, '-');
const locSlug = location.trim()
    .replace(/,\s*/,'--')         // comma → double dash
    .replace(/\s+/g,'-');         // spaces → dash

const searchUrl =
    `https://www.houzz.com/professionals/${kwSlug}/c/${locSlug}`;

/* ── CRAWLER ─────────────────────────────────────────── */
const crawler = new PlaywrightCrawler({
    headless : true,
    maxRequestsPerCrawl : maxPages,
    async requestHandler ({ page, log }) {
        log.info(`▶ ${page.url()}`);

        /* 1. let JS/XHRs load, then scroll a few screens so tiles mount */
        await page.waitForLoadState('networkidle');
        for (let i = 0; i < 3; i++) {
            await page.mouse.wheel(0, 700);
            await page.waitForTimeout(500);
        }

        /* 2. wait (up to 30 s) until first profile anchor exists */
        const found = await page.waitForSelector(
            'a[data-test="pro-title-link"]',
            { timeout: 30000 }
        ).catch(() => null);

        if (!found) {
            log.warning('No contractor tiles appeared – skipping.');
            return;
        }

        /* 3. extract data (dedupe by profileUrl) */
        const rows = await page.$$eval('[data-test="pro-card"]', cards =>
            Array.from(new Set(cards)).map(card => {
                const a = card.querySelector('a[data-test="pro-title-link"]');
                const loc = card.querySelector('[data-test="pro-location"]');
                return {
                    name       : a?.textContent.trim() || null,
                    location   : loc?.textContent.trim() || null,
                    profileUrl : a?.href || null,
                    phone      : null,
                    email      : null,
                    website    : null,
                    license    : null,
                    source     : 'Houzz'
                };
            })
        );

        for (const r of rows) await Actor.pushData(r);
        log.info(`pushed ${rows.length} contractors`);
    }
});

/*  one start-URL in the queue  */
await crawler.run([{ url: searchUrl }]);
await Actor.exit();
