import { Actor } from 'apify'; import { PlaywrightCrawler } from 'crawlee';
await Actor.init();
const { location, keyword, maxPages } = await Actor.getInput();
const zip = location.match(/\d{5}/)?.[0]||'';
const start=`https://porch.com/pros/${keyword.replace(/\s+/g,'-')}/${zip}`;
const crawler=new PlaywrightCrawler({
  headless:true,maxRequestsPerCrawl:maxPages,
  async requestHandler({page,log}) {
    await page.waitForLoadState('networkidle');
    // pierce shadow DOM
    const rows=await page.evaluate(()=>{
      const list=document.querySelector('pro-search-results')?.shadowRoot;
      if(!list) return [];
      return [...list.querySelectorAll('pro-card')].map(card=>{
        const root=card.shadowRoot;
        return {
          name:root?.querySelector('.proCard__title')?.textContent.trim()||null,
          location:root?.querySelector('.proCard__location')?.textContent.trim()||null,
          profileUrl:root?.querySelector('a')?.href||null,
          phone:root?.querySelector('.proCard__phone')?.textContent.trim()||null,
          email:null,website:null,license:null,source:"Porch"
        };
      });
    });
    for(const r of rows) await Actor.pushData(r);
  }
});
await crawler.run([start]); await Actor.exit();
