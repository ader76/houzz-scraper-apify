import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

const {
    zipCodes = [
        "21613", "21677", "21835", "21648", "21622",
        "21631", "21664", "21673", "21869", "21669",
        "21626", "21654", "21675", "21643"
    ],
    keyword = 'general contractor',
    maxPages = 3
} = await Actor.getInput();

const keywordSlug = keyword.replace(/\s+/g, '-').toLowerCase();
const startUrls = zipCodes.map(zip => `https://www.houzz.com/professionals/${keywordSlug}/c/${zip}`);

const crawler = new PlaywrightCrawler({
    headless: true,
    maxRequestsPerCrawl: maxPages * zipCodes.length,

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

        const cards = page.locator('[data-testid="pro-search-result"]');

        const items = await cards.evaluateAll(nodes =>
            nodes.map(node => {
                const name = node.querySelector('h3')?.innerText || null;
                const location = node.querySelector('[data-testid="pro-location"]')?.innerText || null;
                const profileUrl = node.querySelector('a')?.href || null;
                return { name, location, profileUrl };
            })
        );

        log.info(`✅ Extracted ${items.length} items`);

        for (const item of items) {
            await Actor.pushData(item);
        }
    },

    async failedRequestHandler({ request, log }) {
        log.error(`❌ Failed to load: ${request.url}`);
    }
});

await crawler.run(startUrls);
await Actor.exit();
