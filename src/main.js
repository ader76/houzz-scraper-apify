import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

// 1. Read and validate input
const input = await Actor.getInput() || {};
const urls = input.profileUrls;
if (!Array.isArray(urls) || urls.length === 0) {
    throw new Error('Input must contain "profileUrls": [ "https://www.houzz.com/pro/…", … ]');
}

// 2. Build a RequestList from those URLs
const requestList = await Actor.openRequestList(
    'houzz-profiles',
    urls.map(u => ({ url: u }))
);

// 3. Create the crawler
const crawler = new PlaywrightCrawler({
    requestList,
    headless: true,
    preNavigationHooks: [
        async (_ctx, gotoOptions) => {
            gotoOptions.waitUntil = 'networkidle';
        }
    ],
    handlePageFunction: async ({ page, request, log }) => {
        log.info(`▶ Scraping ${request.url}`);

        // --- Name ---
        let name = await page.$eval('h1', el => el.textContent.trim()).catch(() => null);
        if (!name) {
            const title = await page.title();
            name = title.includes(' - ') ? title.split(' - ')[0].trim() : title.trim();
        }

        // --- Location ---
        let location = await page.$eval(
            'xpath=//h3[contains(text(),"Address")]/following-sibling::*[1]',
            el => el.innerText.trim()
        ).catch(() => null);
        if (location) {
            location = location
                .replace(/\s*\n\s*/g, ', ')
                .replace(/,\s*,/g, ',')
                .trim();
        } else {
            // fallback: look for city, state in title
            const title = await page.title();
            const m = title.match(/,\s*[A-Z]{2}/);
            location = m ? title.slice(title.indexOf(m[0]) - 20, title.indexOf('|')).trim() : null;
        }

        // --- Phone ---
        let phone = await page.$eval(
            'xpath=//h3[contains(text(),"Phone")]/following-sibling::*[1]',
            el => el.textContent.trim()
        ).catch(() => null);
        if (!phone) {
            phone = await page.$eval('a[href^="tel:"]',
                a => a.getAttribute('href').replace(/^tel:/, '').trim()
            ).catch(() => null);
        }

        // --- Email ---
        const email = await page.$eval(
            'a[href^="mailto:"]',
            a => a.getAttribute('href').replace(/^mailto:/, '').trim()
        ).catch(() => null);

        // --- Website ---
        let website = await page.$eval(
            'xpath=//h3[contains(text(),"Website")]/following-sibling::*[1]//a',
            a => a.href
        ).catch(() => null);
        if (website) {
            const m = website.match(/trk\/([^/]+)\//);
            if (m) {
                try { website = Buffer.from(m[1], 'base64').toString('utf-8'); }
                catch {}
            }
        }

        // --- License ---
        const licenseNumber = await page.$eval(
            'xpath=//h3[contains(text(),"License")]/following-sibling::*[1]',
            el => el.textContent.trim()
        ).catch(() => null);

        // --- Push data ---
        await Actor.pushData({
            name,
            location,
            phone,
            email,
            website,
            licenseNumber,
            profileUrl: request.url,
            source: 'Houzz'
        });
    },
    handleFailedRequestFunction: async ({ request, error }) => {
        await Actor.pushData({
            profileUrl: request.url,
            error: error.message,
            source: 'Houzz'
        });
    }
});

// 4. Run the crawler
await crawler.run();
await Actor.exit();
