import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

const {
    location = 'Cambridge, MD',
    keyword = 'general contractor',
    maxPages = 1
} = await Actor.getInput();

// Convert location and keyword into URL-safe slugs
const locationSlug = location.replace(/,\s*/g, '--').replace(/\s+/g, '-');
const keywordSlug = keyword.replace(/\s+/g, '-').toLowerCase();
const startUrl = `https://www.houzz.com/professionals/${keywordSlug}/c/${locationSlug}`;

const crawler = new PlaywrightCrawler({
    headless: true,
    maxRequestsPerCrawl: maxPages,

    async requestHandler({ page, request, log }) {
        log.info(`🔍 Visiting: ${request.url}`);

        // Wait until key elements are loaded
        await page.waitForSelector('div[data-testid="pro-search-result"]');
        await page.waitForTimeout(2000); // Allow lazy content to render

        // Scroll to load more results
        await page.evaluate(async () => {
            for (let i = 0; i < 10; i++) {
                window.scrollBy(0, 1500);
                await new Promise(res => setTimeout(res, 500));
            }
        });

        // Extract contractor data
        const items = await page.$$eval('div[data-testid="pro-search-result"]', cards => {
            return cards.map(card => {
                const name = card.querySelector('div[data-testid="pro-search-result-name"]')?.innerText?.trim() || null;
                const location = card.querySelector('div[data-testid="pro-location"]')?.innerText?.trim() || null;
                const profileUrl = card.querySelector('a')?.href || null;
                return { name, location, profileUrl };
            });
        });

        log.info(`✅ Extracted ${items.length} items`);

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
