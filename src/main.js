- const Apify = require('apify');
+ import Apify from 'apify';


Apify.main(async () => {
    // Prepare RequestList from input
    const input = await Apify.getInput();
    const startRequests = [];
    if (input) {
        // Accept either direct URL list or datasetId
        if (input.startUrls) {
            for (const request of input.startUrls) {
                if (typeof request === 'string') {
                    startRequests.push({ url: request });
                } else if (request.url) {
                    startRequests.push({ url: request.url });
                }
            }
        }
        if (input.profileUrls) {
            for (const url of input.profileUrls) {
                if (typeof url === 'string') {
                    startRequests.push({ url });
                } else if (url.url) {
                    startRequests.push({ url: url.url });
                }
            }
        }
        if (input.datasetId) {
            const dataset = await Apify.openDataset(input.datasetId);
            const { items } = await dataset.getData();
            for (const item of items) {
                let url = null;
                if (item.profileUrl) url = item.profileUrl;
                else if (item.url) url = item.url;
                else if (typeof item === 'string') url = item;
                if (url) startRequests.push({ url });
            }
        }
    }
    if (startRequests.length === 0) {
        throw new Error('No profile URLs provided. Please include "startUrls", "profileUrls", or "datasetId" in the input.');
    }
    const requestList = await Apify.openRequestList('houzz-profiles', startRequests);

    // Create PlaywrightCrawler
    const crawler = new Apify.PlaywrightCrawler({
        requestList,
        useSessionPool: true,  // reuse sessions to handle any anti-scraping measures
        preNavigationHooks: [ async (context, gotoOptions) => {
            // Wait for network idle to ensure all data is loaded
            gotoOptions.waitUntil = 'networkidle';
        } ],
        handlePageTimeoutSecs: 60,
        handlePageFunction: async ({ page, request }) => {
            // Object to store the extracted data
            const result = {
                profileUrl: request.url,
                source: "Houzz"
            };

            // Name (contractor/company name)
            let name = '';
            try {
                name = await page.$eval('h1', el => el.textContent.trim());
            } catch (err) {}
            if (!name) {
                // Fallback: derive from page title if needed
                const title = await page.title() || '';
                if (title.includes(' - ')) {
                    name = title.split(' - ')[0].trim();
                } else {
                    name = title.trim();
                }
            }
            result.name = name || null;

            // Location (address or city/state)
            let location = '';
            try {
                // Select the element immediately following the "Address" heading
                location = await page.$eval('xpath=//h3[contains(text(), "Address")]/following-sibling::*[1]', el => el.innerText.trim());
            } catch (err) {}
            if (location) {
                // Replace line breaks with comma+space to form one line address
                location = location.replace(/\s*\n\s*/g, ', ').replace(/,\s*,/g, ',').trim();
            } else {
                // Fallback: try to get city/state from the page title
                const title = await page.title() || '';
                // The title format includes location before "| Houzz"
                if (title.includes(' - ')) {
                    const parts = title.split(' - ');
                    // Usually the last part before "| Houzz" is "City, ST Country"
                    if (parts.length >= 3) {
                        let locPart = parts[parts.length - 1];
                        locPart = locPart.split('|')[0].trim();
                        // Remove trailing country code (e.g. "US") if present
                        if (locPart.endsWith(' US')) {
                            locPart = locPart.slice(0, -3).trim();
                        }
                        location = locPart;
                    }
                }
            }
            result.location = location || null;

            // Phone Number
            let phoneNumber = '';
            try {
                phoneNumber = await page.$eval('xpath=//h3[contains(text(), "Phone")]/following-sibling::*[1]', el => el.textContent.trim());
            } catch (err) {}
            if (!phoneNumber) {
                // Fallback: look for a tel: link
                try {
                    const telLink = await page.$eval('a[href^="tel:"]', a => a.getAttribute('href'));
                    if (telLink) phoneNumber = telLink.replace(/^tel:/, '').trim();
                } catch (err) {}
            }
            result.phoneNumber = phoneNumber || null;

            // Email
            let email = '';
            try {
                email = await page.$eval('a[href^="mailto:"]', a => a.getAttribute('href'));
            } catch (err) {}
            if (email) {
                email = email.replace(/^mailto:/, '').trim();
            }
            result.email = email || null;

            // Website URL
            let websiteUrl = '';
            try {
                websiteUrl = await page.$eval('xpath=//h3[contains(text(), "Website")]/following-sibling::*[1]//a', a => a.getAttribute('href'));
            } catch (err) {}
            if (websiteUrl) {
                // Decode Houzz tracking URL if present
                const match = websiteUrl.match(/trk\/([^\/]+)\//);
                if (match) {
                    try {
                        const decoded = Buffer.from(match[1], 'base64').toString('utf-8');
                        if (decoded) websiteUrl = decoded;
                    } catch (e) {
                        // If decoding fails, we'll keep the original URL
                    }
                }
            } else {
                // Fallback: Check socials for "blog or other site" link
                try {
                    websiteUrl = await page.$eval('a:has-text("Find me on my blog")', a => a.getAttribute('href'));
                } catch (err) {}
                if (websiteUrl) {
                    const match = websiteUrl.match(/trk\/([^\/]+)\//);
                    if (match) {
                        try {
                            const decoded = Buffer.from(match[1], 'base64').toString('utf-8');
                            if (decoded) websiteUrl = decoded;
                        } catch (e) {}
                    }
                }
            }
            result.websiteUrl = websiteUrl || null;

            // License Number
            let licenseNumber = '';
            try {
                licenseNumber = await page.$eval('xpath=//h3[contains(text(), "License")]/following-sibling::*[1]', el => el.textContent.trim());
            } catch (err) {}
            result.licenseNumber = licenseNumber || null;

            // Save the result to the default dataset
            await Apify.pushData(result);
        },
        handleFailedRequestFunction: async ({ request, error }) => {
            console.log(`Failed to scrape ${request.url}: ${error.message}`);
            // Push at least the URL and error info to dataset for record (optional)
            await Apify.pushData({ profileUrl: request.url, error: error.message, source: "Houzz" });
        }
    });

    // Run the crawler
    await crawler.run();
});
