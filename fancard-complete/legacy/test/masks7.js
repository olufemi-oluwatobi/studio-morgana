const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const f=p=>fs.readFileSync(path.join(__dirname,'node_modules',p)).toString('base64');
const fonts={Jost:['500','@fontsource/jost/files/jost-latin-500-normal.woff2'],JostB:['700','@fontsource/jost/files/jost-latin-700-normal.woff2'],Herr:['400','@fontsource/herr-von-muellerhoff/files/herr-von-muellerhoff-latin-400-normal.woff2'],Fr:['100 900','@fontsource-variable/fraunces/files/fraunces-latin-wght-italic.woff2','italic']};
const D={sign:"Nerissa Vale",no:"019",of:"100",set:"04",title:"Muse of the Tide",init:"NV"};
(async()=>{const b=await chromium.launch();const p=await b.newPage();
const res=await p.evaluate(async({F,D})=>{
 for(const k in F){const ff=new FontFace(k,`url(data:font/woff2;base64,${F[k][1]})`,{weight:F[k][0],style:F[k][2]||'normal'});await ff.load();document.fonts.add(ff);}
 const W=1080,HH=1.545,H=Math.round(W*HH),X=v=>v*W,out={};
 const mk=()=>{const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.fillStyle='#fff';x.strokeStyle='#fff';x.lineCap='round';x.lineJoin='round';x.textBaseline='alphabetic';return [c,x];};
 const save=(k,c)=>out[k]=c.toDataURL();
 const fit=(x,t,font,s,max)=>{x.font=font(X(s));while(x.measureText(t).width>X(max)&&s>.01){s-=.0005;x.font=font(X(s));}};
 const star5=(x,cx,cy,r,rot)=>{x.beginPath();for(let i=0;i<10;i++){const a=rot+i*Math.PI/5,rr=i%2?r*.45:r;x.lineTo(X(cx+Math.cos(a)*rr),X(cy+Math.sin(a)*rr));}x.closePath();x.fill();};
 const spark=(x,cx,cy,r)=>{x.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4,rr=i%2?r*.22:r;x.lineTo(X(cx+Math.cos(a)*rr),X(cy+Math.sin(a)*rr));}x.closePath();x.fill();};
 const wy=HH-.27; // bottom of the picture
 const logo=(x,cx,cy,sz)=>{const P=(u,v)=>[X(cx+u*sz),X(cy+v*sz)];
   x.save();x.beginPath();x.moveTo(...P(-.08,.34));x.bezierCurveTo(...P(-.62,-.02),...P(-.42,-.52),...P(-.08,-.24));x.bezierCurveTo(...P(.26,-.52),...P(.46,-.02),...P(-.08,.34));x.fill();
   x.globalCompositeOperation='destination-out';
   x.beginPath();x.moveTo(...P(-.17,-.17));x.lineTo(...P(.08,-.03));x.lineTo(...P(-.17,.11));x.closePath();x.fill();
   x.beginPath();x.arc(...P(.2,.2),X(.27*sz),0,7);x.fill();
   x.globalCompositeOperation='source-over';x.beginPath();x.arc(...P(.2,.2),X(.21*sz),0,7);x.fill();
   x.globalCompositeOperation='destination-out';x.lineWidth=X(.045*sz);
   for(const dy of[-.06,.06]){x.beginPath();for(let i=0;i<=30;i++){const u=.07+i/30*.26;const v=.2+dy+.035*Math.sin((u-.07)/.26*6.283);i?x.lineTo(...P(u,v)):x.moveTo(...P(u,v));}x.stroke();}
   x.restore();};
 const badge=(x,cx,cy,r)=>{x.beginPath();x.arc(X(cx),X(cy),X(r),0,7);x.lineWidth=X(r*.16);x.stroke();
   x.lineWidth=X(r*.15);for(const dy of[-.28,.28]){x.beginPath();for(let i=0;i<=24;i++){const u=-.55+i/24*1.1;i?x.lineTo(X(cx+u*r),X(cy+(dy+.16*Math.sin(u*5.7))*r)):x.moveTo(X(cx+u*r),X(cy+(dy+.16*Math.sin(u*5.7))*r));}x.stroke();}};
 {const [c,x]=mk();save('f_txt',c);}
 {const [c,x]=mk();star5(x,.8,.205,.034,-Math.PI/2+.25);save('f_star',c);}
 /* the chop: a red seal with her initials */
 {const [c,x]=mk();x.save();x.translate(X(.17),X(wy-.08));x.rotate(-.06);x.lineWidth=X(.0055);x.beginPath();x.roundRect(X(-.045),X(-.045),X(.09),X(.09),X(.008));x.stroke();
  x.textAlign='center';x.font=`700 ${X(.042)}px JostB`;x.fillText(D.init,0,X(.015));x.restore();save('f_seal',c);}
 /* staff of waves with her signature on it, and a small line under it like the lyric */
 {const [c,x]=mk();x.lineWidth=X(.0022);
  for(let k=0;k<5;k++){x.beginPath();for(let i=0;i<=220;i++){const xx=.11+i/220*.8,yy=HH-.215+k*.017+.006*Math.sin(xx*26+k*.5);i?x.lineTo(X(xx),X(yy)):x.moveTo(X(xx),X(yy));}x.stroke();}
  // a curling wave in place of the clef
  logo(x,.135,HH-.184,.085);
  x.textAlign='center';x.font=`500 ${X(.022)}px Jost`;x.letterSpacing=`${X(.007)}px`;x.fillText(`SET ${D.set}  ·  ONE OF ${+D.of}`,X(.53),X(HH-.104));x.letterSpacing='0px';
  save('f_staff',c);}
 {const [c,x]=mk();x.save();x.translate(X(.54),X(HH-.165));x.rotate(-.05);x.textAlign='center';fit(x,D.sign,s=>`400 ${s}px Herr`,.13,.66);x.lineWidth=X(.0012);x.strokeText(D.sign,0,0);x.fillText(D.sign,0,0);x.restore();save('f_sig',c);}
 /* back: seigaiha wave scales over the whole field */
 {const [c,x]=mk();x.save();x.beginPath();x.rect(X(.075),X(.075),X(.85),X(HH-.15));x.clip();
  const R=.068;x.lineWidth=X(.0026);
  for(let row=0;row*R*.5<HH+R;row++){const y=row*R*.5,off=row%2?R:0;for(let cx=-R+off;cx<1+R;cx+=R*2){
    x.save();x.beginPath();x.arc(X(cx),X(y),X(R),Math.PI,0);x.lineTo(X(cx+R),X(y+R*2));x.lineTo(X(cx-R),X(y+R*2));x.closePath();x.globalCompositeOperation='destination-out';x.fill();x.restore();
    for(let k=1;k<=4;k++){x.beginPath();x.arc(X(cx),X(y),X(R*k/4.3),Math.PI,0);x.stroke();}}}
  x.restore();
  // clear space for the postmark and signature
  x.globalCompositeOperation='destination-out';
  x.beginPath();x.arc(X(.5),X(.7),X(.25),0,7);x.fill();x.beginPath();x.roundRect(X(.12),X(1.0),X(.76),X(.2),X(.03));x.fill();
  x.globalCompositeOperation='source-over';
  x.lineWidth=X(.004);x.beginPath();x.roundRect(X(.12),X(1.0),X(.76),X(.2),X(.03));x.stroke();x.lineWidth=X(.0018);x.beginPath();x.roundRect(X(.133),X(1.013),X(.734),X(.174),X(.022));x.stroke();
  x.lineWidth=X(.0018);x.beginPath();x.arc(X(.5),X(.7),X(.243),0,7);x.stroke();
  // border inside the margin, with stars at the corners
  x.lineWidth=X(.0045);x.strokeRect(X(.075),X(.075),X(.85),X(HH-.15));x.lineWidth=X(.002);x.strokeRect(X(.093),X(.093),X(.814),X(HH-.186));
  for(const [cx,cy] of [[.093,.093],[.907,.093],[.093,HH-.093],[.907,HH-.093]])star5(x,cx,cy,.022,-Math.PI/2);
  save('b_orn',c);}
 /* back: postmark + signature (gold) */
 {const [c,x]=mk();const cx=.5,cy=.7,r=.21;
  x.lineWidth=X(.006);x.beginPath();x.arc(X(cx),X(cy),X(r),0,7);x.stroke();x.lineWidth=X(.0025);x.beginPath();x.arc(X(cx),X(cy),X(r*.74),0,7);x.stroke();
  x.textAlign='center';x.font=`700 ${X(.03)}px JostB`;const ring=`SET ${D.set}  ✦  ONE OF ${+D.of}  ✦  NOV 2026  ✦  `;
  for(let i=0;i<ring.length;i++){const a=-Math.PI/2+i/ring.length*Math.PI*2;x.save();x.translate(X(cx+Math.cos(a)*r*.87),X(cy+Math.sin(a)*r*.87));x.rotate(a+Math.PI/2);x.fillText(ring[i],0,X(.011));x.restore();}
  x.font=`italic 900 ${X(.05)}px Fr`;x.fillText('fancard',X(cx),X(cy-.066));
  x.font=`500 ${X(.115)}px Jost`;x.fillText(D.no,X(cx),X(cy+.055));
  
  // cancellation waves crossing through the postmark
  x.lineWidth=X(.004);for(let k=0;k<5;k++){x.beginPath();for(let i=0;i<=160;i++){const xx=.62+i/160*.27,yy=cy-.08+k*.04+.012*Math.sin(xx*40+k);i?x.lineTo(X(xx),X(yy)):x.moveTo(X(xx),X(yy));}x.stroke();}
  logo(x,.235,1.1,.1);
  x.save();x.translate(X(.555),X(1.14));x.rotate(-.05);fit(x,D.sign,s=>`400 ${s}px Herr`,.125,.52);x.lineWidth=X(.0012);x.strokeText(D.sign,0,0);x.fillText(D.sign,0,0);x.restore();
  save('b_foil',c);}
 return out;
},{F:Object.fromEntries(Object.entries(fonts).map(([k,v])=>[k,[v[0],f(v[1]),v[2]]])),D});
for(const k in res)fs.writeFileSync(path.join(__dirname,`../bake7/${k}.png`),Buffer.from(res[k].split(',')[1],'base64'));
await b.close();console.log('ok');})();
