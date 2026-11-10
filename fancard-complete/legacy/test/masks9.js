const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const f=p=>fs.readFileSync(path.join(__dirname,'node_modules',p)).toString('base64');
const fonts={Jost:['500','@fontsource/jost/files/jost-latin-500-normal.woff2'],Fr:['100 900','@fontsource-variable/fraunces/files/fraunces-latin-wght-italic.woff2','italic']};
const D={no:"001",ed:"ALPHA"};
(async()=>{const b=await chromium.launch();const p=await b.newPage();
const res=await p.evaluate(async({F,D})=>{
 for(const k in F){const ff=new FontFace(k,`url(data:font/woff2;base64,${F[k][1]})`,{weight:F[k][0],style:F[k][2]||'normal'});await ff.load();document.fonts.add(ff);}
 const W=1080,HH=1.545,H=Math.round(W*HH),X=v=>v*W,out={};
 const mk=()=>{const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.fillStyle='#fff';x.strokeStyle='#fff';x.lineCap='square';x.lineJoin='miter';x.textAlign='center';x.textBaseline='alphabetic';return [c,x];};
 const save=(k,c)=>out[k]=c.toDataURL();
 const pl=(x,pts,w)=>{x.lineWidth=X(w);x.beginPath();pts.forEach(([a,b],i)=>i?x.lineTo(X(a),X(b)):x.moveTo(X(a),X(b)));x.stroke();};
 const dot=(x,a,b,r)=>{x.beginPath();x.arc(X(a),X(b),X(r),0,7);x.fill();};
 const ring=(x,a,b,r,w)=>{x.lineWidth=X(w);x.beginPath();x.arc(X(a),X(b),X(r),0,7);x.stroke();};
 const logo=(x,cx,cy,sz)=>{const P=(u,v)=>[X(cx+u*sz),X(cy+v*sz)];
   x.save();x.beginPath();x.moveTo(...P(-.08,.34));x.bezierCurveTo(...P(-.62,-.02),...P(-.42,-.52),...P(-.08,-.24));x.bezierCurveTo(...P(.26,-.52),...P(.46,-.02),...P(-.08,.34));x.fill();
   x.globalCompositeOperation='destination-out';
   x.beginPath();x.moveTo(...P(-.17,-.17));x.lineTo(...P(.08,-.03));x.lineTo(...P(-.17,.11));x.closePath();x.fill();
   x.beginPath();x.arc(...P(.2,.2),X(.27*sz),0,7);x.fill();
   x.globalCompositeOperation='source-over';x.beginPath();x.arc(...P(.2,.2),X(.21*sz),0,7);x.fill();
   x.globalCompositeOperation='destination-out';x.lineWidth=X(.045*sz);x.lineCap='round';
   for(const dy of[-.06,.06]){x.beginPath();for(let i=0;i<=30;i++){const u=.07+i/30*.26;const v=.2+dy+.035*Math.sin((u-.07)/.26*6.283);i?x.lineTo(...P(u,v)):x.moveTo(...P(u,v));}x.stroke();}
   x.restore();x.lineCap='square';};
 /* ---------- front ---------- */
 {const [c,x]=mk();const g=.0028;
  // circuit traces machined into the frame, with 45 degree jogs and terminals
  pl(x,[[.03,.2],[.03,.4],[.045,.415],[.045,.7]],g);dot(x,.03,.2,.006);dot(x,.045,.7,.006);
  pl(x,[[.97,.3],[.97,.78],[.955,.795],[.955,1.05]],g);dot(x,.97,.3,.006);dot(x,.955,1.05,.006);
  pl(x,[[.03,.86],[.03,1.24]],g);dot(x,.03,1.24,.006);
  pl(x,[[.2,.032],[.31,.032],[.325,.047]],g);pl(x,[[.8,.032],[.69,.032],[.675,.047]],g);dot(x,.2,.032,.005);dot(x,.8,.032,.005);
  pl(x,[[.06,HH-.03],[.42,HH-.03]],g);pl(x,[[.58,HH-.03],[.66,HH-.03]],g);
  // corner brackets
  for(const [sx,sy] of [[1,1],[-1,1],[1,-1],[-1,-1]]){const cx=sx>0?.022:.978,cy=sy>0?.022:HH-.022;pl(x,[[cx,cy+sy*.07],[cx,cy],[cx+sx*.07,cy]],.004);}
  save('f_grv',c);}
 {const [c,x]=mk();
  // vent slots, glowing from inside
  for(let i=0;i<4;i++){x.beginPath();x.roundRect(X(.958),X(.13+i*.032),X(.014),X(.022),X(.004));x.fill();}
  for(let i=0;i<4;i++){x.beginPath();x.roundRect(X(.028),X(1.0+i*.032),X(.014),X(.022),X(.004));x.fill();}
  for(let i=0;i<6;i++){x.beginPath();x.roundRect(X(.44+i*.022),X(HH-.04),X(.012),X(.02),X(.003));x.fill();}
  save('f_slot',c);}
 {const [c,x]=mk();
  x.font=`italic 900 ${X(.05)}px Fr`;x.fillText('fancard',X(.5),X(.09));
  x.textAlign='center';x.font=`500 ${X(.075)}px Jost`;x.fillText(D.no,X(.8),X(HH-.188));
  logo(x,.135,HH-.168,.06);
  x.textAlign='left';x.font=`500 ${X(.027)}px Jost`;x.letterSpacing=`${X(.008)}px`;x.fillText(D.ed,X(.18),X(HH-.16));x.letterSpacing='0px';
  save('f_txt',c);}
 /* ---------- back ---------- */
 {const [c,x]=mk();const g=.0028,cx=.5,cy=.74;
  ring(x,cx,cy,.24,g);ring(x,cx,cy,.265,.0016);
  for(let i=0;i<48;i++){const a=i/48*6.283,r0=.245,r1=i%4?.255:.262;pl(x,[[cx+Math.cos(a)*r0,cy+Math.sin(a)*r0],[cx+Math.cos(a)*r1,cy+Math.sin(a)*r1]],.002);}
  const tr=[[[.5,.5],[.5,.3],[.35,.15],[.35,.07]],[[.5,.98],[.5,1.18],[.65,1.33],[.65,1.47]],[[.26,.74],[.12,.74],[.07,.69],[.07,.25]],[[.74,.74],[.88,.74],[.93,.79],[.93,1.29]],
    [[.33,.57],[.2,.44],[.2,.12]],[[.67,.91],[.8,1.04],[.8,1.42]],[[.67,.57],[.8,.44],[.8,.3],[.9,.2]],[[.33,.91],[.2,1.04],[.2,1.2],[.1,1.3]]];
  for(const t of tr){pl(x,t,g);const e=t[t.length-1];dot(x,e[0],e[1],.007);}
  for(const [sx,sy] of [[1,1],[-1,1],[1,-1],[-1,-1]]){const qx=sx>0?.022:.978,qy=sy>0?.022:HH-.022;pl(x,[[qx,qy+sy*.07],[qx,qy],[qx+sx*.07,qy]],.004);}
  save('b_grv',c);}
 {const [c,x]=mk();
  for(let i=0;i<7;i++){x.beginPath();x.roundRect(X(.4+i*.03),X(.17),X(.016),X(.05),X(.004));x.fill();}
  for(let i=0;i<7;i++){x.beginPath();x.roundRect(X(.4+i*.03),X(1.32),X(.016),X(.05),X(.004));x.fill();}
  save('b_slot',c);}
 {const [c,x]=mk();const cx=.5,cy=.74;
  x.font=`italic 900 ${X(.07)}px Fr`;x.fillText('fancard',X(cx),X(cy+.005));
  x.font=`500 ${X(.027)}px Jost`;x.letterSpacing=`${X(.008)}px`;x.fillText(`${D.ed}  ·  Nº ${D.no}`,X(cx),X(cy+.06));x.letterSpacing='0px';
  logo(x,cx,cy-.095,.07);
  save('b_txt',c);}
 return out;
},{F:Object.fromEntries(Object.entries(fonts).map(([k,v])=>[k,[v[0],f(v[1]),v[2]]])),D});
for(const k in res)fs.writeFileSync(path.join(__dirname,`../bake8/${k}.png`),Buffer.from(res[k].split(',')[1],'base64'));
await b.close();console.log('ok');})();
