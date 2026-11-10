const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const f=p=>fs.readFileSync(path.join(__dirname,'node_modules',p)).toString('base64');
const fonts={Dafoe:['400','@fontsource/mr-dafoe/files/mr-dafoe-latin-400-normal.woff2'],Shrik:['400','@fontsource/shrikhand/files/shrikhand-latin-400-normal.woff2'],Saira:['700','@fontsource/saira-condensed/files/saira-condensed-latin-700-normal.woff2']};
const D={sign:"Sienna Rae",no:"019",of:"100",set:"03"};
(async()=>{const b=await chromium.launch();const p=await b.newPage();
const res=await p.evaluate(async({F,D})=>{
 for(const k in F){const ff=new FontFace(k,`url(data:font/woff2;base64,${F[k][1]})`,{weight:F[k][0]});await ff.load();document.fonts.add(ff);}
 const W=1080,H=Math.round(W*1.545),X=v=>v*W,out={};
 const mk=()=>{const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.fillStyle='#fff';x.strokeStyle='#fff';x.textAlign='center';x.textBaseline='alphabetic';return [c,x];};
 const fit=(x,t,font,s,max)=>{x.font=font(X(s));while(x.measureText(t).width>X(max)&&s>.01){s-=.0005;x.font=font(X(s));}};
 const save=(k,c)=>out[k]=c.toDataURL();
 /* front */
 {const [c,x]=mk();x.font=`400 ${X(.05)}px Shrik`;x.fillText('fancard',X(.5),X(.093));save('f_word',c);}
 {const [c,x]=mk();x.save();x.translate(X(.5),X(1.36));x.rotate(-.11);fit(x,D.sign,s=>`400 ${s}px Dafoe`,.2,.78);x.fillText(D.sign,0,0);x.restore();save('f_sig',c);}
 /* back: tone-on-tone relief */
 {const [c,x]=mk();
  x.font=`400 ${X(.074)}px Shrik`;x.fillText('Admit One',X(.5),X(.36));
  x.letterSpacing=`${X(.008)}px`;x.font=`700 ${X(.03)}px Saira`;x.fillText(`SET ${D.set}  ·  GOLDEN HOUR  ·  FIRST SHOWING`,X(.5),X(.425));
  x.fillText(`ONE OF ${+D.of}`,X(.5),X(1.165));x.letterSpacing='0px';
  save('b_rel',c);}
 /* back: yellow foil */
 {const [c,x]=mk();x.font=`400 ${X(.052)}px Shrik`;x.fillText('fancard',X(.5),X(.19));
  x.font=`400 ${X(.27)}px Shrik`;x.fillText(D.no,X(.5),X(.98));
  x.save();x.translate(X(.5),X(1.36));x.rotate(-.11);fit(x,D.sign,s=>`400 ${s}px Dafoe`,.18,.72);x.fillText(D.sign,0,0);x.restore();
  save('b_foil',c);}
 return out;
},{F:Object.fromEntries(Object.entries(fonts).map(([k,v])=>[k,[v[0],f(v[1])]])),D});
for(const k in res)fs.writeFileSync(path.join(__dirname,`../bake5/${k}.png`),Buffer.from(res[k].split(',')[1],'base64'));
await b.close();console.log('ok');})();
