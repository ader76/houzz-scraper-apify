import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

const {
    location = 'Cambridge, MD',
    keyword   = 'general contractor',
    maxPages  = 3,
} = await Actor.getInput();

/** Build Houzz URL
 *  - keyword -> “general-contractor”
 *  - location -> “Cambridge--MD”
 */
const keywordSlug = keyword.trim().toLowerCase().replace(/\s+/g, '-');
const [cityRaw, stateRaw] = location.split(',').map(t => t.trim());
const citySlug   = cityRaw.replace(/\s+/g, '-');
const stateSlug  = stateRaw.replace(/\s+/g, '-');
const locationSlug = `${citySlug}--${stateSlug}`;
const startUrl =
    `https://www.houzz.com/professionals/${keywordSlug}/c/${locationSlug}`;

const crawler = new PlaywrightCrawler({
    headless: true,
    maxRequestsPerCrawl: maxPages,
    async requestHandler({ page, request, log }) {
        log.info(`Processing ${request.url}`);

        // Wait until at least one profile tile link appears
        await page.waitForSelector('a[href*="/pro/"]', { timeout: 45000 });

        // Scroll to force lazy-load of more tiles
        await page.evaluate(async () => {
            for (let y = 0; y < document.body.scrollHeight; y += 600) {
                window.scrollTo(0, y);
                await new Promise(r => setTimeout(r, 250));
            }
        });

        // Extract basic data
        const profiles = await page.$$eval(
            'a[href*="/pro/"]',
            as => Array.from(new Set(as.map(a => ({
                profileUrl: a.href,
                name:       a.textContent.trim() || null,
                location:   a.closest('[data-test="pro-card"]')
                              ?.querySelector('[data-test="pro-location"]')
                              ?.textContent.trim() || null,
            }))))
        );

        for (const p of profiles) await Actor.pushData(p);
    },
    async failedRequestHandler({ request, log }) {
        log.error(`Request ${request.url} failed too many times`);
    },
});

await crawler.run([startUrl]);
await Actor.exit();
