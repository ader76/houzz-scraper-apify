File	Must contain
package.json	"type": "module" and "main": "src/main.js"
Dockerfile	FROM apify/actor-node-playwright-chrome (unchanged)

Input example

json
Copy
Edit
{
  "profileUrls": [
    "https://www.houzz.com/pro/chesapeake-builders-inc/chesapeake-builders-inc",
    "https://www.houzz.com/pro/supernova-construction/supernova-construction-and-remodeling"
  ]
}
Build → Run → The default dataset will fill with full contractor details from
each profile URL.







