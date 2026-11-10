const {chromium}=require('playwright');const path=require('path');
(async()=>{const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:460,height:800},deviceScaleFactor:1,reducedMotion:'no-preference'});const p=await ctx.newPage();
p.on('pageerror',e=>console.log('ERR',e.message));
const html=require('fs').readFileSync(path.resolve(__dirname,'../pilot-card.html'),'utf8');
await p.setContent('<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"></head><body style="background:#0f0f12">'+html+'</body></html>');
await p.waitForTimeout(1200);
const st=p.locator('#stage');const out=path.resolve(__dirname,'../anim');
const r=await st.boundingBox();const cx=r.x+r.width/2,cy=r.y+r.height/2;
// still images, front then back
await p.mouse.move(2,2);await p.waitForTimeout(1600);
await st.screenshot({path:out+'/front.png'});
await st.focus();await p.keyboard.press('Enter');await p.waitForTimeout(1500);
await st.screenshot({path:out+'/back.png'});
await p.keyboard.press('Enter');await p.waitForTimeout(1500);
// clip: press to tilt, sweep across, then flip once from the settled front
let n=0;const snap=async()=>{await st.screenshot({path:out+`/f${String(n++).padStart(3,'0')}.png`});};
await p.mouse.move(cx,cy);await p.mouse.down();
for(let i=0;i<12;i++){await p.mouse.move(cx+(i-6)*r.width*.06,cy-(i-6)*r.height*.02);await p.waitForTimeout(60);await snap();}
for(let i=0;i<12;i++){await p.mouse.move(cx+(6-i)*r.width*.06,cy+(i-6)*r.height*.02);await p.waitForTimeout(60);await snap();}
await p.mouse.move(cx,cy);await p.waitForTimeout(250);await snap();
await p.mouse.up();await p.waitForTimeout(500);
// the flip itself, from the settled front, after the tilt has come to rest
await p.mouse.move(2,2);await p.waitForTimeout(1400);
for(let i=0;i<14;i++){await snap();await p.waitForTimeout(i===0?20:40);if(i===0){await st.focus();await p.keyboard.press('Enter');}}
await p.waitForTimeout(900);
for(let i=0;i<6;i++){await snap();await p.waitForTimeout(90);}
await b.close();console.log('frames',n);})();
