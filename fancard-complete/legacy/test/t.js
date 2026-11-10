const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const f=(p)=>fs.readFileSync(path.join('node_modules',p)).toString('base64');
const face=(fam,w,st,p)=>`@font-face{font-family:"${fam}";font-weight:${w};font-style:${st};src:url(data:font/woff2;base64,${f(p)}) format("woff2");}`;
const css=[face('Big Shoulders Display',900,'normal','@fontsource/big-shoulders-display/files/big-shoulders-display-latin-900-normal.woff2'),
face('Homemade Apple',400,'normal','@fontsource/homemade-apple/files/homemade-apple-latin-400-normal.woff2'),
face('Martian Mono',700,'normal','@fontsource/martian-mono/files/martian-mono-latin-700-normal.woff2'),
face('Martian Mono',500,'normal','@fontsource/martian-mono/files/martian-mono-latin-400-normal.woff2'),
face('Fraunces','100 900','italic','@fontsource-variable/fraunces/files/fraunces-latin-wght-italic.woff2')].join('');
const src=fs.readFileSync('/mnt/user-data/uploads/Tinsel_Queen_Photocard__1_.html','utf8');
const D0='const D={name:"Tinsel Queen",title:"Showstopper",handle:"@creator",no:"024",of:"100",to:"@yourfan"};';
if(!src.includes(D0))throw 'noD';
const cases={
 asis:s=>s,
 stress:s=>s.replace(D0,'const D={name:"Seraphina Valentine-Okafor",title:"Queen of the Midnight Encore",handle:"@seraphinavalentineofficial",no:"1024",of:"5000",to:"@thebiggestfanintheworld"};'),
 short:s=>s.replace(D0,'const D={name:"Vi",title:"Ace",handle:"@vi",no:"1",of:"10",to:"@jo"};'),
 swap:s=>s.replace(/const PHOTO="data:[^"]+"/,'const PHOTO="'+fs.readFileSync('swap.b64','utf8').trim()+'"'),
};
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
for(const [k,fn] of Object.entries(cases)){
 const ctx=await b.newContext({viewport:{width:460,height:900},deviceScaleFactor:2,reducedMotion:'reduce'});const p=await ctx.newPage();
 p.on('pageerror',e=>console.log(k,'ERR',e.message));
 await p.route(/fonts\.googleapis\.com/,r=>r.fulfill({contentType:'text/css',body:css}));
 await p.route(/fonts\.gstatic\.com/,r=>r.abort());
 const tmp=`/tmp/claude-0/-home-claude/d5c528f3-de72-5ee3-8398-0c88cf384ece/scratchpad/test/${k}.html`;fs.writeFileSync(tmp,fn(src));
 await p.goto('file://'+tmp);await p.waitForTimeout(2500);
 const box=await p.evaluate(()=>{const r=document.getElementById('stage').getBoundingClientRect();return [r.width,r.height,r.height/r.width]});console.log(k,box);
 const st=p.locator('#stage');await st.screenshot({path:`../out/${k}-front.png`});
 await st.focus();await p.keyboard.press('f');await p.waitForTimeout(1200);
 await st.screenshot({path:`../out/${k}-back.png`});await ctx.close();
}
await b.close();})();
