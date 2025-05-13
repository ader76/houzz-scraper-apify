import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

// Get input values
const {
    location = 'Cambridge, MD',
    keyword = 'general contractor',
    maxPages = 3
} = await Actor.getInput();

// Build Houzz-compatible slug
const locationSlug = location.replace(/,\s*/g, '--').replace(/\s+/g, '-');
const keywordSlug = keyword.replace(/\s+/g, '-').toLowerCase();
const startUrl = `https://www.houzz.com/professionals/${keywordSlug}/c/${locationSlug}`;

const crawler = new PlaywrightCrawler({
    headless: true,
    maxRequestsPerCrawl: maxPages,

    async requestHandler({ page, request, log }) {
        log.info(`🔍 Visiting: ${request.url}`);

        // Wait for full load and lazy content
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        // Scroll to load more contractor cards
        await page.evaluate(async () => {
            for (let i = 0; i < 10; i++) {
                window.scrollBy(0, 1000);
                await new Promise(res => setTimeout(res, 500));
            }
        });

        // Extract name + profile link
        const items = await page.$$eval('a[href*="/pro/"]', cards => {
            return cards.map(card => {
                const name = card.querySelector('h3')?.innerText || null;
                const profileUrl = card.href ?? null;
                return { name, profileUrl };
            });
        });

        // Push results to Apify dataset
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
