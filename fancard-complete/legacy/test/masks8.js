const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const f=p=>fs.readFileSync(path.join(__dirname,'node_modules',p)).toString('base64');
const fonts={Jost:['500','@fontsource/jost/files/jost-latin-500-normal.woff2'],Fr:['100 900','@fontsource-variable/fraunces/files/fraunces-latin-wght-italic.woff2','italic']};
const D={no:"001",ed:"ALPHA"};
(async()=>{const b=await chromium.launch();const p=await b.newPage();
const res=await p.evaluate(async({F,D})=>{
 for(const k in F){const ff=new FontFace(k,`url(data:font/woff2;base64,${F[k][1]})`,{weight:F[k][0],style:F[k][2]||'normal'});await ff.load();document.fonts.add(ff);}
 const W=1080,HH=1.545,H=Math.round(W*HH),X=v=>v*W,out={};
 const mk=()=>{const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.fillStyle='#fff';x.strokeStyle='#fff';x.lineCap='round';x.lineJoin='round';x.textAlign='center';x.textBaseline='alphabetic';return [c,x];};
 const save=(k,c)=>out[k]=c.toDataURL();
 const logo=(x,cx,cy,sz)=>{const P=(u,v)=>[X(cx+u*sz),X(cy+v*sz)];
   x.save();x.beginPath();x.moveTo(...P(-.08,.34));x.bezierCurveTo(...P(-.62,-.02),...P(-.42,-.52),...P(-.08,-.24));x.bezierCurveTo(...P(.26,-.52),...P(.46,-.02),...P(-.08,.34));x.fill();
   x.globalCompositeOperation='destination-out';
   x.beginPath();x.moveTo(...P(-.17,-.17));x.lineTo(...P(.08,-.03));x.lineTo(...P(-.17,.11));x.closePath();x.fill();
   x.beginPath();x.arc(...P(.2,.2),X(.27*sz),0,7);x.fill();
   x.globalCompositeOperation='source-over';x.beginPath();x.arc(...P(.2,.2),X(.21*sz),0,7);x.fill();
   x.globalCompositeOperation='destination-out';x.lineWidth=X(.045*sz);
   for(const dy of[-.06,.06]){x.beginPath();for(let i=0;i<=30;i++){const u=.07+i/30*.26;const v=.2+dy+.035*Math.sin((u-.07)/.26*6.283);i?x.lineTo(...P(u,v)):x.moveTo(...P(u,v));}x.stroke();}
   x.restore();};
 /* front: engraved in the bottom plate */
 {const [c,x]=mk();const y=HH-.083;
  logo(x,.2,y,.07);
  x.textAlign='left';x.font=`italic 900 ${X(.046)}px Fr`;x.fillText('fancard',X(.255),X(y+.016));
  x.textAlign='right';x.font=`500 ${X(.026)}px Jost`;x.letterSpacing=`${X(.008)}px`;x.fillText(`${D.ed} · Nº ${D.no}`,X(.85),X(y+.01));x.letterSpacing='0px';
  save('f_eng',c);}
 /* back: engraved on the ring plate and the bottom plate */
 {const [c,x]=mk();const cx=.5,cy=.74;
  x.font=`italic 900 ${X(.042)}px Fr`;x.fillText('fancard',X(cx),X(cy-.006));
  x.font=`500 ${X(.017)}px Jost`;x.letterSpacing=`${X(.005)}px`;x.fillText(`${D.ed} · Nº ${D.no}`,X(cx),X(cy+.036));x.letterSpacing='0px';
  logo(x,.5,HH-.09,.075);
  save('b_eng',c);}
 return out;
},{F:Object.fromEntries(Object.entries(fonts).map(([k,v])=>[k,[v[0],f(v[1]),v[2]]])),D});
for(const k in res)fs.writeFileSync(path.join(__dirname,`../bake8/${k}.png`),Buffer.from(res[k].split(',')[1],'base64'));
await b.close();console.log('ok');})();
