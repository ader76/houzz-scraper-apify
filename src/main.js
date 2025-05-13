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
        log.info(`Processing: ${request.url}`);
        await page.waitForLoadState('domcontentloaded');

        const items = await page.$$eval('a', anchors => {
            return anchors
                .map(a => a.href)
                .filter(url => url.includes('/professional/') || url.includes('/pro/'));
        });

        for (const url of items) {
            await Actor.pushData({ profileUrl: url });
        }
    },
    async failedRequestHandler({ request, log }) {
        log.error(`Request failed: ${request.url}`);
    }
});

await crawler.run([startUrl]);

await Actor.exit();
