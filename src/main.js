import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

const { location = 'Cambridge, MD', keyword = 'general contractor', maxPages = 3 } = await Actor.getInput();

const startUrl = `https://www.houzz.com/professionals/query=${encodeURIComponent(keyword)}&location=${encodeURIComponent(location)}`;

const crawler = new PlaywrightCrawler({
    headless: true,
    maxRequestsPerCrawl: maxPages,
    async requestHandler({ page, request, log }) {
        log.info(`Processing: ${request.url}`);

        await page.waitForLoadState('domcontentloaded');

        const items = await page.$$eval('.hz-pro-search-results__item', cards => {
            return cards.map(card => {
                const name = card.querySelector('.hz-pro-search-results__name')?.innerText ?? null;
                const location = card.querySelector('.hz-pro-search-results__location')?.innerText ?? null;
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
