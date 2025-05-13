import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

const { location = 'Cambridge, MD', keyword = 'general contractor', maxPages = 3 } = await Actor.getInput();

const locationSlug = location.replace(/,\s*/g, '--').replace(/\s+/g, '-');
const keywordSlug = keyword.replace(/\s+/g, '-').toLowerCase();
const startUrl = `https://www.houzz.com/professionals/${keywordSlug}/c/${locationSlug}`;

const crawler = new PlaywrightCrawler({
    headless: true,
    maxRequestsPerCrawl: maxPages,

    async requestHandler({ page, request, log }) {
        log.info(`🔍 Visiting: ${request.url}`);

        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(3000);

        const items = await page.$$eval('a[href*="/professional/"]', cards => {
            return cards.map(card => {
                const name = null;
                const location = null;
                const profileUrl = card.href ?? null;
                return { name, location, profileUrl };
            });
        });

        for (const item of items) {
            await Actor.pushData(item);
        }
    },

    async failedRequestHandler({ request, log }) {
        log.error(`❌ Failed to load: ${request.url}`);
    }
});

await crawler.run([startUrl]);
await Actor.exit();