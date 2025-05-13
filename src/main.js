import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

// Read input values from Apify
const {
    location = 'Cambridge, MD',
    keyword = 'general contractor',
    maxPages = 3
} = await Actor.getInput();

// Convert input to Houzz-friendly URL slug
const locationSlug = location.replace(/,\s*/g, '--').replace(/\s+/g, '-');
const keywordSlug = keyword.replace(/\s+/g, '-').toLowerCase();

// Build the start URL
const startUrl = `https://www.houzz.com/professionals/${keywordSlug}/c/${locationSlug}`;

const crawler = new PlaywrightCrawler({
    headless: true,
    maxRequestsPerCrawl: maxPages,

    async requestHandler({ page, request, log }) {
        log.info(`Processing: ${request.url}`);

       await page.waitForLoadState('networkidle'); // wait until all content loads
await page.waitForTimeout(3000); // wait extra time for dynamic content

const items = await page.$$eval('a[href*="/professional/"]', cards => {
    return cards.map(card => {
        const name = card.querySelector('h3')?.innerText || null;
        const location = card.querySelector('[data-testid="pro-location"]')?.innerText || null;
        const profileUrl = card.href ?? null;
        return { name, location, profileUrl };
    });
});

            return cards.map(card => {
                const name = card.querySelector('[data-testid="pro-search-result-name"]')?.innerText 
                          || card.querySelector('h3')?.innerText 
                          || null;

                const location = card.querySelector('[data-testid="pro-location"]')?.innerText
                               || card.querySelector('.hz-pro-search-results__location')?.innerText
                               || null;

                const profileUrl = card.querySelector('a')?.href ?? null;

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
