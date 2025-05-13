/*****************************************************************
 *  Houzz Contractor Profile Scraper
 *  Input : { "profileUrls": [ "https://www.houzz.com/pro/...", … ] }
 *  Output: dataset → name, location, phone, email, website, licenseNumber,
 *                     profileUrl, source="Houzz"
 *****************************************************************/
import * as Apify from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Apify.Actor.init();

/* ---------- read input ---------- */
const { profileUrls = [] } = (await Apify.Actor.getInput()) ?? {};
if (!profileUrls.length) throw new Error('Input must contain "profileUrls".');

- const requestList = await Apify.Actor.openRequestList(
+ const requestList = await Apify.openRequestList(
    'houzz-profiles',
    profileUrls.map(url => ({ url }))
);


/* ---------- crawler ---------- */
const crawler = new PlaywrightCrawler({
    requestList,
    headless: true,
    preNavigationHooks: [
        async (_ctx, gotoOpts) => { gotoOpts.waitUntil = 'networkidle'; }
    ],
    handlePageFunction: async ({ page, request, log }) => {
        log.info(`▶ ${request.url}`);

        /* ---- NAME ---- */
        let name = await page.$eval('h1', h => h.textContent.trim()).catch(() => null);
        if (!name) {
            const t = await page.title();
            name = t.includes(' - ') ? t.split(' - ')[0].trim() : t.trim();
        }

        /* ---- LOCATION ---- */
        let location = await page.$eval(
            'xpath=//h3[contains(text(),"Address")]/following-sibling::*[1]',
            el => el.innerText.trim()
        ).catch(() => null);
        if (location) location = location.replace(/\s*\n\s*/g, ', ').replace(/,\s*,/g, ',').trim();
        else {
            const t = await page.title();
            const m = t.match(/[^-]+ - ([^|]+)/);
            if (m) location = m[1].replace(/\s*US$/, '').trim();
        }

        /* ---- PHONE ---- */
        let phone = await page.$eval(
            'xpath=//h3[contains(text(),"Phone")]/following-sibling::*[1]',
            el => el.textContent.trim()
        ).catch(() => null);
        if (!phone) {
            phone = await page.$eval('a[href^="tel:"]',
                a => a.getAttribute('href').replace(/^tel:/,'')
            ).catch(() => null);
        }

        /* ---- EMAIL ---- */
        const email = await page.$eval(
            'a[href^="mailto:"]',
            a => a.getAttribute('href').replace(/^mailto:/,'')
        ).catch(() => null);

        /* ---- WEBSITE ---- */
        let website = await page.$eval(
            'xpath=//h3[contains(text(),"Website")]/following-sibling::*[1]//a',
            a => a.href
        ).catch(() => null);
        if (website) {
            const m = website.match(/trk\/([^/]+)\//);
            if (m) {
                try { website = Buffer.from(m[1], 'base64').toString('utf-8'); } catch {}
            }
        }

        /* ---- LICENSE ---- */
        const licenseNumber = await page.$eval(
            'xpath=//h3[contains(text(),"License")]/following-sibling::*[1]',
            el => el.textContent.trim()
        ).catch(() => null);

        await Apify.Actor.pushData({
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
        await Apify.Actor.pushData({ profileUrl: request.url, error: error.message, source: 'Houzz' });
    }
});

/* ---------- run ---------- */
await crawler.run();
await Apify.Actor.exit();
