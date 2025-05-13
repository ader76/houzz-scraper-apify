import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

const {
    location = 'Cambridge, MD',
    keyword   = 'general contractor',
    maxPages  = 1,
} = await Actor.getInput();

// ---------- build Houzz slug ----------
const locSlug = location.trim()
    .replace(/,\s*/g, '--')   // “Cambridge, MD” -> “Cambridge--MD”
    .replace(/\s+/g, '-');

const kwSlug  = keyword.trim()
    .toLowerCase()
    .replace(/\s+/g, '-');

const startUrl = `https://www.houzz.com/professionals/${kwSlug}/c/${locSlug}`;
// --------------------------------------

const crawler = new PlaywrightCrawler({
    headless: true,
    maxRequestsPerCrawl: maxPages,
    async requestHandler({ page, request, log }) {
        log.info(`→ ${request.url}`);

        // 1) let JS settle, then scroll 3× to trigger lazy tiles
        await page.waitForLoadState('networkidle');
        for (let i = 0; i < 3; i++) {
            await page.mouse.wheel(0, 600);
            await page.waitForTimeout(800);
        }

        // 2) wait until the first tile anchor is present in DOM (NOT visible)
        await page.waitForSelector('a[data-test="pro-title-link"]', {timeout: 30000});

        // 3) scrape
        const tiles = await page.$$eval('[data-test="pro-card"]', cards =>
            cards.map(card => {
                const a        = card.querySelector('a[data-test="pro-title-link"]');
                const name     = a?.textContent.trim() || null;
                const profile  = a?.href || null;
                const location = card.querySelector('[data-test="pro-location"]')
                                    ?.textContent.trim() || null;
                return { name, location, profileUrl: profile };
            })
        );

        for (const t of tiles) await Actor.pushData(t);

        log.info(`pushed ${tiles.length} contractors`);
    },
});

await crawler.run([startUrl]);
await Actor.exit();
