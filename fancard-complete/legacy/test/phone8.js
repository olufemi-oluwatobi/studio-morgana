const {chromium}=require('playwright');const path=require('path');
(async()=>{const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:360,height:740},deviceScaleFactor:3,reducedMotion:'no-preference',hasTouch:true,isMobile:true});const p=await ctx.newPage();
p.on('pageerror',e=>console.log('ERR',e.message));
const html=require('fs').readFileSync(path.resolve(__dirname,'../alpha-card.html'),'utf8');
await p.setContent('<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>'+html+'</body></html>');await p.waitForTimeout(1500);
console.log(await p.evaluate(()=>[document.documentElement.scrollWidth,innerWidth]));
const st=p.locator('#stage');const out=path.resolve(__dirname,'../out');
await st.screenshot({path:out+'/a-front.png'});
await st.tap();
for(let i=0;i<6;i++){await p.waitForTimeout(70);await st.screenshot({path:out+`/a-flip${i}.png`});}
await p.waitForTimeout(800);await st.screenshot({path:out+'/a-back.png'});
await b.close();})();
