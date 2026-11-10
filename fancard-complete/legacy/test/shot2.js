const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const f=fs.readFileSync(path.join(__dirname,'node_modules/@fontsource/lilita-one/files/lilita-one-latin-400-normal.woff2')).toString('base64');
const css=`@font-face{font-family:"Lilita One";font-weight:400;src:url(data:font/woff2;base64,${f}) format("woff2");}`;
(async()=>{const b=await chromium.launch();
for(const [name,vp,dsf] of [['d',{width:520,height:800},2],['m',{width:390,height:780},3]]){
const ctx=await b.newContext({viewport:vp,deviceScaleFactor:dsf,reducedMotion:'reduce',hasTouch:name=='m'});const p=await ctx.newPage();
p.on('pageerror',e=>console.log('ERR',e.message));
await p.route(/fonts\.googleapis/,r=>r.fulfill({contentType:'text/css',body:css}));await p.route(/gstatic/,r=>r.abort());
await p.goto('file://'+path.resolve(__dirname,'../pilot-card.html'));await p.waitForTimeout(1200);
const st=p.locator('#stage');const out=path.resolve(__dirname,'../out');
await st.screenshot({path:`${out}/q-${name}-front.png`});
if(name=='d'){const r=await st.boundingBox();await p.mouse.move(r.x+r.width*.85,r.y+r.height*.2);await p.waitForTimeout(900);await st.screenshot({path:`${out}/q-d-tilt.png`});await p.mouse.move(r.x+r.width/2,r.y+r.height/2);}
await st.focus();await p.keyboard.press('Enter');await p.waitForTimeout(700);await st.screenshot({path:`${out}/q-${name}-back.png`});
console.log(name,await p.evaluate(()=>[document.documentElement.scrollWidth,innerWidth]));await ctx.close();}
await b.close();})();
