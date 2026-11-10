const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const f=p=>fs.readFileSync(path.join(__dirname,'node_modules',p)).toString('base64');
const fonts={Dafoe:['400','normal','@fontsource/mr-dafoe/files/mr-dafoe-latin-400-normal.woff2'],Bod:['700','italic','@fontsource/bodoni-moda/files/bodoni-moda-latin-700-italic.woff2'],BodR:['400','normal','@fontsource/bodoni-moda/files/bodoni-moda-latin-400-normal.woff2']};
const D={sign:"Sienna Rae",no:"019",of:"100",set:"03"};
(async()=>{const b=await chromium.launch();const p=await b.newPage();
const res=await p.evaluate(async({F,D})=>{
 for(const k in F){const ff=new FontFace(k,`url(data:font/woff2;base64,${F[k][2]})`,{weight:F[k][0],style:F[k][1]});await ff.load();document.fonts.add(ff);}
 const W=1080,HH=1.545,H=Math.round(W*HH),X=v=>v*W,out={};
 const mk=()=>{const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.fillStyle='#fff';x.strokeStyle='#fff';x.lineCap='round';x.lineJoin='round';x.textAlign='center';x.textBaseline='alphabetic';return [c,x];};
 const save=(k,c)=>out[k]=c.toDataURL();
 const fit=(x,t,font,s,max)=>{x.font=font(X(s));while(x.measureText(t).width>X(max)&&s>.01){s-=.0005;x.font=font(X(s));}};
 /* ---- ornament vocabulary ---- */
 function curl(x,cx,cy,r,a0,turns,dir,w){ // inward spiral
   const n=60;x.beginPath();for(let i=0;i<=n;i++){const t=i/n,a=a0+dir*t*turns*6.283,rr=r*(1-.82*t);const px=cx+Math.cos(a)*rr,py=cy+Math.sin(a)*rr;i?x.lineTo(X(px),X(py)):x.moveTo(X(px),X(py));}
   x.lineWidth=X(w);x.stroke();x.beginPath();x.arc(X(cx+Math.cos(a0+dir*turns*6.283)*r*.18),X(cy+Math.sin(a0+dir*turns*6.283)*r*.18),X(w*.9),0,7);x.fill();}
 function leaf(x,px,py,ang,len,wid){const c=Math.cos(ang),s=Math.sin(ang),nx=-s,ny=c;
   x.beginPath();x.moveTo(X(px),X(py));x.quadraticCurveTo(X(px+c*len*.5+nx*wid),X(py+s*len*.5+ny*wid),X(px+c*len),X(py+s*len));
   x.quadraticCurveTo(X(px+c*len*.5-nx*wid),X(py+s*len*.5-ny*wid),X(px),X(py));x.fill();}
 function bead(x,x0,y0,x1,y1,step,r){const L=Math.hypot(x1-x0,y1-y0),n=Math.floor(L/step);for(let i=0;i<=n;i++){const t=i/n;x.beginPath();x.arc(X(x0+(x1-x0)*t),X(y0+(y1-y0)*t),X(r),0,7);x.fill();}}
 function rrect(x,l,t,r,b,rad,w){x.lineWidth=X(w);x.beginPath();x.roundRect(X(l),X(t),X(r-l),X(b-t),X(rad));x.stroke();}
 /* corner flourish in top-left local space */
 function corner(x){
   x.lineWidth=X(.0045);
   // C-scroll along the top edge
   x.beginPath();x.moveTo(X(.062),X(.105));x.bezierCurveTo(X(.075),X(.05),X(.17),X(.04),X(.215),X(.068));x.stroke();
   curl(x,.205,.088,.02,-1.2,1.15,1,.0042);
   // and down the side
   x.beginPath();x.moveTo(X(.105),X(.062));x.bezierCurveTo(X(.05),X(.075),X(.04),X(.17),X(.068),X(.215));x.stroke();
   curl(x,.088,.205,.02,-0.4,1.15,-1,.0042);
   // palmette fanning out of the corner into the photo
   for(let i=-2;i<=2;i++){leaf(x,.07,.07,.785+i*.3,.1-Math.abs(i)*.016,.017);}
   x.globalCompositeOperation='destination-out';for(let i=-2;i<=2;i++){x.lineWidth=X(.0024);const a=.785+i*.3,l=.09-Math.abs(i)*.016;x.beginPath();x.moveTo(X(.07+Math.cos(a)*.02),X(.07+Math.sin(a)*.02));x.lineTo(X(.07+Math.cos(a)*l),X(.07+Math.sin(a)*l));x.stroke();}x.globalCompositeOperation='source-over';
   x.beginPath();x.arc(X(.07),X(.07),X(.016),0,7);x.fill();
   curl(x,.142,.142,.016,2.3,1.1,1,.0036);
   leaf(x,.215,.068,.2,.035,.008);leaf(x,.068,.215,1.37,.035,.008);
 }
 function corners(x){for(const [sx,sy] of [[1,1],[-1,1],[1,-1],[-1,-1]]){x.save();x.translate(X(sx<0?1:0),X(sy<0?HH:0));x.scale(sx,sy);corner(x);x.restore();}}
 /* vine running along a band: centre line from (x0,y0) to (x1,y1) */
 function vine(x,x0,y0,x1,y1,amp){
   const L=Math.hypot(x1-x0,y1-y0),ux=(x1-x0)/L,uy=(y1-y0)/L,nx=-uy,ny=ux,per=.07,N=200;
   x.lineWidth=X(.0034);x.beginPath();for(let i=0;i<=N;i++){const s=i/N*L,o=amp*Math.sin(s/per*6.283);const px=x0+ux*s+nx*o,py=y0+uy*s+ny*o;i?x.lineTo(X(px),X(py)):x.moveTo(X(px),X(py));}x.stroke();
   for(let s=per*.25,k=0;s<L-.01;s+=per/2,k++){const side=k%2?1:-1,o=amp*side;const px=x0+ux*s+nx*o,py=y0+uy*s+ny*o;
     curl(x,px+nx*side*.0105+ux*.006,py+ny*side*.0105+uy*.006,.0085,Math.atan2(uy,ux)+(side>0?1.6:-1.6),1.1,side,.0026);
     leaf(x,px,py,Math.atan2(uy-ny*side*.6,ux-nx*side*.6)+3.14,.022,.0055);}
 }
 function frame(x,inset){
   rrect(x,.016,.016,.984,HH-.016,.04,.0055);
   rrect(x,.052,.052,.948,HH-.052,.018,.0035);
   vine(x,.034,.25,.034,HH-.25,.0065);vine(x,.966,.25,.966,HH-.25,.0065);
   vine(x,.25,.034,.75,.034,.0065);vine(x,.25,HH-.034,.75,HH-.034,.0065);
   corners(x);
 }
 /* ---- front ---- */
 {const [c,x]=mk();frame(x);
   // cartouche at the top centre holding the wordmark
   x.lineWidth=X(.004);x.beginPath();x.ellipse(X(.5),X(.072),X(.15),X(.042),0,0,7);x.stroke();
   x.lineWidth=X(.0022);x.beginPath();x.ellipse(X(.5),X(.072),X(.138),X(.033),0,0,7);x.stroke();
   curl(x,.33,.072,.016,0,1.1,1,.0034);x.save();x.translate(X(1),0);x.scale(-1,1);curl(x,.33,.072,.016,0,1.1,1,.0034);x.restore();
   // palmette at the bottom centre
   for(let i=-2;i<=2;i++)leaf(x,.5,HH-.04,-1.571+i*.32,.04-Math.abs(i)*.007,.008);
   save('f_orn',c);}
 {const [c,x]=mk();x.font=`italic 700 ${X(.048)}px Bod`;x.fillText('fancard',X(.5),X(.087));save('f_word',c);}
 {const [c,x]=mk();x.globalCompositeOperation='source-over';x.fillStyle='#fff';x.beginPath();x.ellipse(X(.5),X(.072),X(.148),X(.04),0,0,7);x.fill();save('f_cart',c);}
 /* ---- back: ogee lattice field, medallion, same frame ---- */
 {const [c,x]=mk();frame(x);
   x.save();x.beginPath();x.roundRect(X(.07),X(.07),X(.86),X(HH-.14),X(.012));x.clip();
   const P=.2,A=.055;x.lineWidth=X(.0026);
   for(let cx=-.1;cx<1.2;cx+=.16){for(const sg of[1,-1]){x.beginPath();for(let i=0;i<=300;i++){const y=i/300*HH;const xx=cx+sg*A*Math.sin(y/P*6.283);i?x.lineTo(X(xx),X(y)):x.moveTo(X(xx),X(y));}x.stroke();}}
   for(let cx=-.1;cx<1.2;cx+=.16)for(let y=0;y<HH+.1;y+=P){for(const [ox,oy] of [[.08,P*.5],[0,0]]){const px=cx+ox,py=y+oy;
     for(let k=0;k<4;k++)leaf(x,px,py,k*1.571,.021,.011);x.beginPath();x.arc(X(px),X(py),X(.0045),0,7);x.fill();}}
   x.restore();
   // clear the medallion and draw its frame
   x.globalCompositeOperation='destination-out';x.beginPath();x.ellipse(X(.5),X(.74),X(.3),X(.36),0,0,7);x.fill();x.globalCompositeOperation='source-over';
   x.lineWidth=X(.0055);x.beginPath();x.ellipse(X(.5),X(.74),X(.29),X(.35),0,0,7);x.stroke();
   x.lineWidth=X(.0024);x.beginPath();x.ellipse(X(.5),X(.74),X(.268),X(.328),0,0,7);x.stroke();
   for(let i=0;i<64;i++){const a=i/64*6.283;x.beginPath();x.arc(X(.5+Math.cos(a)*.279),X(.74+Math.sin(a)*.339),X(.0028),0,7);x.fill();}
   for(const sg of[-1,1]){x.save();x.translate(X(.5),X(.74));x.scale(sg,1);curl(x,.0,-.395,.022,1.2,1.1,1,.0036);x.restore();}
   for(let i=-3;i<=3;i++)leaf(x,.5,.405,-1.571+i*.28,.05-Math.abs(i)*.009,.009);
   for(let i=-3;i<=3;i++)leaf(x,.5,1.075,1.571+i*.28,.05-Math.abs(i)*.009,.009);
   save('b_orn',c);}
 {const [c,x]=mk();
   x.font=`italic 700 ${X(.05)}px Bod`;x.fillText('fancard',X(.5),X(.555));
   x.font=`400 ${X(.024)}px BodR`;x.letterSpacing=`${X(.008)}px`;x.fillText('Nº',X(.5),X(.63));x.letterSpacing='0px';
   x.font=`italic 700 ${X(.2)}px Bod`;x.fillText(D.no,X(.5),X(.81));
   x.font=`400 ${X(.026)}px BodR`;x.letterSpacing=`${X(.009)}px`;x.fillText(`ONE OF ${+D.of}  ·  SET ${D.set}`,X(.5),X(.87));x.letterSpacing='0px';
   x.save();x.translate(X(.5),X(.975));x.rotate(-.1);fit(x,D.sign,s=>`400 ${s}px Dafoe`,.12,.38);x.fillText(D.sign,0,0);x.restore();
   save('b_foil',c);}
 return out;
},{F:fonts? Object.fromEntries(Object.entries(fonts).map(([k,v])=>[k,[v[0],v[1],f(v[2])]])):0,D});
for(const k in res)fs.writeFileSync(path.join(__dirname,`../bake5/${k}.png`),Buffer.from(res[k].split(',')[1],'base64'));
await b.close();console.log('ok');})();
