import { Actor } from 'apify'; import { PlaywrightCrawler } from 'crawlee';
await Actor.init();
const { location, keyword, maxPages } = await Actor.getInput();
const zip = location.match(/\d{5}/)?.[0]||'';
const start=`https://www.buildzoom.com/${zip}-${keyword.replace(/\s+/g,'-')}`;
const crawler=new PlaywrightCrawler({
  headless:true,maxRequestsPerCrawl:maxPages,
  async requestHandler({page,log}) {
    log.info(`▶ ${page.url()}`);
    await page.waitForSelector('.contractor-tile',{timeout:30000});
    const rows=await page.$$eval('.contractor-tile',(tiles)=>tiles.map(t=>{
      const data=JSON.parse(t.dataset.source||'{}');
      return {
        name:data.company_name||null,
        location:`${data.city||''}, ${data.state||''}`.trim(),
        profileUrl:data.profile_url||null,
        phone:data.phone||null,
        email:null,website:data.website||null,
        license:data.license_number||null,
        source:"BuildZoom"
      };
    }));
    for(const r of rows) await Actor.pushData(r);
  }
});
await crawler.run([start]); await Actor.exit();
