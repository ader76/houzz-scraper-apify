/*****************************************************************
 *  Houzz Contractor Profile Scraper (Playwright, ES-module)
 *  ------------------------------------------------------------
 *  • Input  : { "profileUrls": [ "https://www.houzz.com/pro/...", … ] }
 *  • Output : dataset with
 *             name, location, phone, email, website, licenseNumber,
 *             profileUrl, source="Houzz"
 *****************************************************************/

import * as Apify from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Apify.Actor.init();

/* ---------- read & validate input ---------- */
const input = await Apify.Actor.getInput() || {};
const urls  = input.profileUrls || [];
if (!Array.isArray(urls) || urls.length === 0) {
    throw new Error(
        'Input JSON must contain "profileUrls": [ "https://www.houzz.com/pro/...", … ]'
    );
}

const requestList = await Apify.Actor.openRequestList(
    'houzz-profiles',
    urls.map(u => ({ url: u }))
);

/* ---------- crawler ---------- */
const crawler = new PlaywrightCrawler({
    requestList,
    headless: true,
    preNavigationHooks: [
        async (_ctx, gotoOpts) => { gotoOpts.waitUntil = 'networkidle'; }
    ],
    handlePageFunction: async ({ page, request, log }) => {
        log.info(`▶ Scraping ${request.url}`);

        /* ---- NAME ------------------------------------------------ */
        let name = await page.$eval('h1', h => h.textContent.trim())
                     .catch(() => null);
        if (!name) {
            /* fallback: title before first “ - ” */
            const t = await page.title();
            name = t.includes(' - ') ? t.split(' - ')[0].trim() : t.trim();
        }

        /* ---- LOCATION / ADDRESS ---------------------------------- */
        let location = await page.$eval(
            'xpath=//h3[contains(text(),"Address")]/following-sibling::*[1]',
            el => el.innerText.trim()
        ).catch(() => null);
        if (location)
            location = location.replace(/\s*\n\s*/g, ', ').replace(/,\s*,/g, ',').trim();
        else {
            /* fallback: city,state in title */
            const t = await page.title();
            const m = t.match(/,\s*[A-Z]{2}(?=[^a-zA-Z]|$)/);
            location = m ? t.substring(m.index -  t.split(' - ')[0].length).split('|')[0].trim() : null;
        }

        /* ---- PHONE ------------------------------------------------ */
        let phone = await page.$eval(
            'xpath=//h3[contains(text(),"Phone")]/following-sibling::*[1]',
            el => el.textContent.trim()
        ).catch(() => null);
        if (!phone) {
            phone = await page.$eval('a[href^="tel:"]',
                     a => a.getAttribute('href').replace(/^tel:/,'')
            ).catch(() => null);
        }

        /* ---- EMAIL (rare) ---------------------------------------- */
        const email = await page.$eval(
            'a[href^="mailto:"]',
            a => a.getAttribute('href').replace(/^mailto:/,'')
        ).catch(() => null);

        /* ---- WEBSITE --------------------------------------------- */
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
        } else {
            website = await page.$eval(
                'a:has-text("my blog")',
                a => a.href
            ).catch(() => null);
        }

        /* ---- LICENSE NUMBER -------------------------------------- */
        const license = await page.$eval(
            'xpath=//h3[contains(text(),"License")]/following-sibling::*[1]',
            el => el.textContent.trim()
        ).catch(() => null);

        /* ---- PUSH RESULT ----------------------------------------- */
        await Apify.Actor.pushData({
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
        await Apify.Actor.pushData({
            profileUrl: request.url,
            error: error.message,
            source: 'Houzz'
        });
    }
});

/* ---------- RUN ---------- */
await crawler.run();
await Apify.Actor.exit();
