import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

const {
    location = 'Cambridge, MD',
    keyword = 'general contractor',
    maxPages = 3
} = await Actor.getInput();

const locationSlug = location.replace(/,\s*/g, '--').replace(/\s+/g, '-');
const keywordSlug = keyword.replace(/\s+/g, '-').toLowerCase();
const startUrl = `https://www.houzz.com/professionals/${keywordSlug}/c/${locationSlug}`;

const crawler = new PlaywrightCrawler({
    headless: true,
    maxRequestsPerCrawl: maxPages,

    async requestHandler({ page, request, log }) {
        log.info(`🔍 Visiting: ${request.url}`);

        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        // Scroll deeply to trigger lazy loading
        await page.evaluate(async () => {
            for (let i = 0; i < 15; i++) {
                window.scrollBy(0, 1500);
                await new Promise(res => setTimeout(res, 500));
            }
        });

        // Extract only the profile URLs from contractor tiles
        const items = await page.$$eval('a[href*="/professional/"]', cards => {
            return cards.map(card => {
                const profileUrl = card.href ?? null;
                return { profileUrl };
            });
        });

        console.log(`✅ Extracted ${items.length} items`);

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
