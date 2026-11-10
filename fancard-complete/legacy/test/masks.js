const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const f=p=>fs.readFileSync(path.join(__dirname,'node_modules',p)).toString('base64');
const fonts={Michroma:['400','@fontsource/michroma/files/michroma-latin-400-normal.woff2','normal'],Saira:['700','@fontsource/saira-condensed/files/saira-condensed-latin-700-normal.woff2','normal'],Sign:['400','@fontsource/mrs-saint-delafield/files/mrs-saint-delafield-latin-400-normal.woff2','normal'],Fraunces:['100 900','@fontsource-variable/fraunces/files/fraunces-latin-wght-italic.woff2','italic']};
const D=JSON.parse(fs.readFileSync(path.join(__dirname,'../card.json'),'utf8'));
(async()=>{const b=await chromium.launch();const p=await b.newPage();
const res=await p.evaluate(async({fonts:F,D})=>{
 for(const k in F){const ff=new FontFace(k,`url(data:font/woff2;base64,${F[k][1]})`,{weight:F[k][0],style:F[k][2]});await ff.load();document.fonts.add(ff);}
 const W=1080,H=Math.round(W*1.545);const out={};
 const mk=()=>{const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.fillStyle='#fff';x.strokeStyle='#fff';x.textBaseline='alphabetic';return [c,x];};
 const X=v=>v*W;
 const fit=(x,txt,font,size,max)=>{let s=size;x.font=font(X(s));while(x.measureText(txt).width>X(max)&&s>.01){s-=.0005;x.font=font(X(s));}};
 const common=(x,left,right)=>{
  x.textAlign='center';x.font=`italic 800 ${X(.066)}px Fraunces`;x.fillText('fancard',X(.5),X(.112));
  x.save();x.translate(X(.5),X(1.44));x.rotate(-.045);x.textAlign='center';fit(x,D.sign,s=>`400 ${s}px Sign`,.2,.74);x.lineWidth=X(.0011);x.strokeText(D.sign,0,0);x.fillText(D.sign,0,0);x.restore();
 };
 {const [c,x]=mk();common(x,`SET ${D.set}`,`Nº ${D.no} / ${D.of}`);out.front=c.toDataURL();}
 {const [c,x]=mk();common(x,`SET ${D.set}`,`ONE OF ${+D.of}`);out.back=c.toDataURL();}
 /* aviator wings + centre roundel */
 {const [c,x]=mk();const cx=.5,cy=.66,rd=.128;
  for(const side of [-1,1]){
   const n=11;
   for(let i=n-1;i>=0;i--){const t=i/(n-1);
    const len=.325-.215*t,ang=(-7+49*t)*Math.PI/180,w=.0245-.005*t;
    const rx=cx+side*(rd*.82),ry=cy-.052+t*.105;
    const tx=rx+side*Math.cos(ang)*len,ty=ry+Math.sin(ang)*len;
    const nx=-Math.sin(ang),ny=Math.cos(ang);
    const path=()=>{x.beginPath();x.moveTo(X(rx),X(ry));
     x.bezierCurveTo(X(rx+side*Math.cos(ang)*len*.55-nx*0*side),X(ry+Math.sin(ang)*len*.55-w*1.3),X(tx-side*Math.cos(ang)*.03),X(ty-w*1.05),X(tx),X(ty));
     x.bezierCurveTo(X(tx-side*Math.cos(ang)*.012),X(ty+w*.9),X(rx+side*Math.cos(ang)*len*.5),X(ry+Math.sin(ang)*len*.5+w*1.1),X(rx),X(ry+w*.8));x.closePath();};
    path();x.globalCompositeOperation='destination-out';x.lineWidth=X(.0055);x.stroke();x.globalCompositeOperation='source-over';x.fill();
   }
  }
  x.globalCompositeOperation='destination-out';x.beginPath();x.arc(X(cx),X(cy),X(rd+.012),0,7);x.fill();x.globalCompositeOperation='source-over';
  x.beginPath();x.arc(X(cx),X(cy),X(rd),0,7);x.fill();
  out.wings=c.toDataURL();}
 {const [c,x]=mk();const cx=.5,cy=.66,rd=.128;
  x.lineWidth=X(.0028);x.beginPath();x.arc(X(cx),X(cy),X(rd*.87),0,7);x.stroke();
  x.textAlign='center';fit(x,D.no,s=>`400 ${s}px Michroma`,.074,.185);x.fillText(D.no,X(cx),X(cy+.024));
  x.letterSpacing=`${X(.004)}px`;x.font=`700 ${X(.021)}px Saira`;x.fillText(`OF ${D.of}`,X(cx),X(cy+.066));x.letterSpacing='0px';
  x.font=`700 ${X(.021)}px Saira`;x.letterSpacing=`${X(.004)}px`;x.fillText(`SET ${D.set}`,X(cx),X(cy-.052));x.letterSpacing='0px';
  out.num=c.toDataURL();}
 return out;
},{fonts:Object.fromEntries(Object.entries(fonts).map(([k,v])=>[k,[v[0],f(v[1]),v[2]]])),D});
for(const k in res)fs.writeFileSync(path.join(__dirname,`../bake/m_${k}.png`),Buffer.from(res[k].split(',')[1],'base64'));
await b.close();console.log('masks ok');})();
