import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

// Read user input
const {
    location = 'Cambridge, MD',
    keyword = 'general contractor',
    maxPages = 3
} = await Actor.getInput();

// Convert location and keyword into URL slugs
const locationSlug = location.replace(/,\s*/g, '--').replace(/\s+/g, '-');
const keywordSlug = keyword.replace(/\s+/g, '-').toLowerCase();

// Final Houzz search URL
const startUrl = `https://www.houzz.com/professionals/${keywordSlug}/c/${locationSlug}`;

const crawler = new PlaywrightCrawler({
    headless: true,
    maxRequestsPerCrawl: maxPages,

    async requestHandler({ page, request, log }) {
        log.info(`🔍 Processing: ${request.url}`);

        // Wait until content loads fully
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(3000);

        const items = await page.$$eval('[data-testid="pro-search-result"]', cards => {
            return cards.map(card => {
                const name = card.querySelector('[data-testid="pro-name"]')?.innerText
                          || card.querySelector('h3')?.innerText
                          || null;

                const location = card.querySelector('[data-testid="pro-location"]')?.innerText
                               || null;

                const profileUrl = card.querySelector('a')?.href || null;

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
