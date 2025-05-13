/*****************************************************************
 *  Houzz Profile Deep-Scraper – ES-module, PlaywrightCrawler
 *  Input  : { "profileUrls": [ "https://www.houzz.com/pro/xxxxx", … ] }
 *  Output : one JSON item per profile with
 *           name · location · phone · email · website · license · profileUrl
 *****************************************************************/

import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

/* ---------- read input ---------- */
const input = await Actor.getInput() || {};
const urls  = input.profileUrls || [];
if (!urls.length) {
    throw new Error('Input must contain "profileUrls": [ ... ]');
}

const requestList = await Actor.openRequestList(
    'houzz-profiles', urls.map(url => ({ url }))
);

/* ---------- crawler ---------- */
const crawler = new PlaywrightCrawler({
    requestList,
    headless: true,
    preNavigationHooks: [ async (_ctx, gotoOpts) => {
        gotoOpts.waitUntil = 'networkidle';      // wait for all XHR
    }],
    handlePageFunction: async ({ page, request, log }) => {
        log.info(`Scraping ${request.url}`);

        /* name ---------------------------------------------------- */
        let name = await page.$eval('h1', h => h.textContent.trim())
                     .catch(() => null);
        if (!name) {                       // fallback: page title
            const t = await page.title();
            name = t.split(' - ')[0].trim();
        }

        /* address / location -------------------------------------- */
        let location = await page.$eval(
            'xpath=//h3[contains(text(),"Address")]/following-sibling::*[1]',
            el => el.innerText.trim()
        ).catch(() => null);
        if (location)
            location = location.replace(/\s*\n\s*/g, ', ').replace(/,\s*,/g, ',').trim();

        /* phone --------------------------------------------------- */
        let phone = await page.$eval(
            'xpath=//h3[contains(text(),"Phone")]/following-sibling::*[1]',
            el => el.textContent.trim()
        ).catch(() => null);
        if (!phone) {
            phone = await page.$eval('a[href^="tel:"]',
                    a => a.getAttribute('href').replace(/^tel:/,'')
            ).catch(() => null);
        }

        /* email (rare) ------------------------------------------- */
        const email = await page.$eval(
            'a[href^="mailto:"]',
            a => a.getAttribute('href').replace(/^mailto:/,'')
        ).catch(() => null);

        /* website ------------------------------------------------- */
        let website = await page.$eval(
            'xpath=//h3[contains(text(),"Website")]/following-sibling::*[1]//a',
            a => a.href
        ).catch(() => null);
        if (website) {
            // decode Houzz tracking redirect if present
            const m = website.match(/trk\\/([^/]+)\\//);
            if (m) {
                try {
                    website = Buffer.from(m[1], 'base64').toString('utf-8');
                } catch {}
            }
        }

        /* license ------------------------------------------------- */
        const license = await page.$eval(
            'xpath=//h3[contains(text(),"License")]/following-sibling::*[1]',
            el => el.textContent.trim()
        ).catch(() => null);

        /* push ---------------------------------------------------- */
        await Actor.pushData({
            name,
            location,
            phone,
            email,
            website,
            licenseNumber: license,
            profileUrl: request.url,
            source: 'Houzz'
        });
    },
    handleFailedRequestFunction: async ({ request, error }) => {
        await Actor.pushData({ profileUrl: request.url, error: error.message, source: 'Houzz' });
    }
});

/* ---------- run ---------- */
await crawler.run();
await Actor.exit();
