import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

const { location = 'Cambridge, MD', keyword = 'general contractor', maxPages = 3 } = await Actor.getInput();

// Build Houzz-compatible URL
const locationSlug = location.replace(/,\s*/g, '--').replace(/\s+/g, '-');
const keywordSlug = keyword.replace(/\s+/g, '-').toLowerCase();
const startUrl = `https://www.houzz.com/professionals/${keywordSlug}/c/${locationSlug}`;

const crawler = new PlaywrightCrawler({
    headless: true,
    maxRequestsPerCrawl: maxPages,
    async requestHandler({ page, request, log }) {
        log.info(`Processing: ${request.url}`);

        await page.waitForLoadState('domcontentloaded');

        const items = await page.$$eval('[data-testid="pro-search-result"]', cards => {
            return cards.map(card => {
                const name = card.querySelector('[data-testid="pro-name"]')?.innerText ?? null;
                const location = card.querySelector('[data-testid="pro-location"]')?.innerText ?? null;
                const profileUrl = card.querySelector('a')?.href ?? null;
                return { name, location, profileUrl };
            });
        });

        for (const item of items) {
            await Actor.pushData(item);
        }
    },
    async failedRequestHandler({ request, log }) {
        log.error(`Request failed: ${request.url}`);
    }
});

await crawler.run([startUrl]);

await Actor.exit();
