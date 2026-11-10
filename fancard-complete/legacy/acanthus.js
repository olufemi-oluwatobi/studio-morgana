 /* ---- acanthus: tapered spiral stems carrying separate lobed fronds; veins/outlines go to a second (niello) mask ---- */
 const occl=(v,path)=>{v.save();v.globalCompositeOperation='destination-out';path(v);v.fill();v.restore();};
 function frond(x,v,ox,oy,ang,L,bend,lobes,side){const N=64,C=[],Nn=[],WL=[],WR=[];let px=ox,py=oy,a=ang;const ds=L/N;
   for(let i=0;i<=N;i++){const u=i/N;C.push([px,py]);Nn.push([-Math.sin(a)*side,Math.cos(a)*side]);
     const w=L*.3*Math.pow(Math.sin(Math.PI*Math.min(1,Math.pow(u,.55))),.85)*(1-.2*u),f=(u*lobes)%1,tooth=Math.pow(f,1.7);
     WL.push(w*(.42+.8*tooth)*Math.min(1,u/.1));WR.push(w*.4*Math.min(1,u/.1));
     a+=bend*(1+3*u*u)/N;px+=Math.cos(a)*ds;py+=Math.sin(a)*ds;}
   const path=c=>{c.beginPath();for(let i=0;i<=N;i++){const X=C[i][0]+Nn[i][0]*WL[i],Y=C[i][1]+Nn[i][1]*WL[i];i?c.lineTo(X,Y):c.moveTo(X,Y);}
     for(let i=N;i>=0;i--)c.lineTo(C[i][0]-Nn[i][0]*WR[i],C[i][1]-Nn[i][1]*WR[i]);c.closePath();};
   path(x);x.fill();occl(v,path);const lw=Math.max(1,L*.024);v.lineWidth=lw;path(v);v.stroke();
   v.beginPath();for(let i=0;i<=N*.9;i++){i?v.lineTo(C[i][0],C[i][1]):v.moveTo(C[i][0],C[i][1]);}v.stroke();
   for(let k=1;k<=lobes;k++){const i=Math.min(N,Math.round((k/lobes-.03)*N));if(i<6)continue;const j=Math.max(0,i-Math.round(N/lobes*.7));
     v.beginPath();v.moveTo(C[j][0],C[j][1]);v.quadraticCurveTo(C[i][0]+Nn[i][0]*WL[i]*.25,C[i][1]+Nn[i][1]*WL[i]*.25,C[i][0]+Nn[i][0]*WL[i]*.88,C[i][1]+Nn[i][1]*WL[i]*.88);v.stroke();
     const g=Math.min(N,Math.round(k/lobes*N)+2);if(k<lobes){v.beginPath();v.ellipse(C[g][0]+Nn[g][0]*WL[g]*.6,C[g][1]+Nn[g][1]*WL[g]*.6,lw*1.3,lw*2.6,Math.atan2(Nn[g][1],Nn[g][0]),0,7);v.fill();}}
   v.lineWidth=lw*.75;for(let i=5;i<N*.86;i+=3){v.beginPath();v.moveTo(C[i][0]-Nn[i][0]*WR[i]*.92,C[i][1]-Nn[i][1]*WR[i]*.92);v.lineTo(C[i][0]-Nn[i][0]*WR[i]*.25,C[i][1]-Nn[i][1]*WR[i]*.25);v.stroke();}}
 function scroll(x,v,cx,cy,R,a0,turns,dir,o={}){const n=170,P=[],Ws=o.stem||R*.22,F=o.fronds??4,Lf=o.frond||R*1.15,lb=o.lobes||4;
   for(let i=0;i<=n;i++){const t=i/n,a=a0+dir*turns*6.2832*t,r=R*Math.exp(-1.45*t);P.push([cx+Math.cos(a)*r,cy+Math.sin(a)*r,a,t]);}
   const w=t=>Ws*(1-.62*t)*.5;
   const sp=c=>{c.beginPath();P.forEach((p,i)=>{const X=p[0]+Math.cos(p[2])*w(p[3]),Y=p[1]+Math.sin(p[2])*w(p[3]);i?c.lineTo(X,Y):c.moveTo(X,Y);});
     for(let i=n;i>=0;i--){const p=P[i];c.lineTo(p[0]-Math.cos(p[2])*w(p[3]),p[1]-Math.sin(p[2])*w(p[3]));}c.closePath();};
   sp(x);x.fill();occl(v,sp);v.lineWidth=Math.max(1,Ws*.09);sp(v);v.stroke();
   v.beginPath();P.forEach((p,i)=>{if(p[3]>.88)return;i?v.lineTo(p[0],p[1]):v.moveTo(p[0],p[1]);});v.stroke();
   const e=P[n],er=Ws*.8;x.beginPath();x.arc(e[0],e[1],er,0,7);x.fill();occl(v,c=>{c.beginPath();c.arc(e[0],e[1],er,0,7);});
   v.beginPath();v.arc(e[0],e[1],er,0,7);v.stroke();v.beginPath();v.arc(e[0],e[1],er*.38,0,7);v.fill();
   for(let k=F-1;k>=0;k--){const t=.05+k*(.7/F),p=P[Math.round(t*n)],ox=Math.cos(p[2]),oy=Math.sin(p[2]),ta=p[2]+dir*Math.PI/2;
     const bx=-Math.cos(ta),by=-Math.sin(ta),ang=Math.atan2(oy*.8+by*.6,ox*.8+bx*.6);
     frond(x,v,p[0]+ox*w(t),p[1]+oy*w(t),ang,Lf*(1-.5*t),dir*(o.bend??1.5),lb,-dir);}}
 function leafPath(x,px,py,ang,len,wid){const c=Math.cos(ang),s=Math.sin(ang),nx=-s,ny=c;x.beginPath();x.moveTo(px,py);
   x.quadraticCurveTo(px+c*len*.5+nx*wid,py+s*len*.5+ny*wid,px+c*len,py+s*len);x.quadraticCurveTo(px+c*len*.5-nx*wid,py+s*len*.5-ny*wid,px,py);}
 function rosette(x,v,cx,cy,r,n){v.lineWidth=Math.max(1,r*.03);
   for(let k=0;k<n;k++){const a=k/n*6.2832;leafPath(x,cx,cy,a,r,r*.3);x.fill();occl(v,c=>leafPath(c,cx,cy,a,r,r*.3));leafPath(v,cx,cy,a,r,r*.3);v.stroke();}
   for(let k=0;k<n;k++){const a=(k+.5)/n*6.2832,pth=c=>leafPath(c,cx,cy,a,r*.72,r*.24);pth(x);x.fill();occl(v,pth);pth(v);v.stroke();
     v.beginPath();v.moveTo(cx+Math.cos(a)*r*.3,cy+Math.sin(a)*r*.3);v.lineTo(cx+Math.cos(a)*r*.62,cy+Math.sin(a)*r*.62);v.stroke();}
   x.beginPath();x.arc(cx,cy,r*.3,0,7);x.fill();occl(v,c=>{c.beginPath();c.arc(cx,cy,r*.3,0,7);});v.beginPath();v.arc(cx,cy,r*.3,0,7);v.stroke();
   for(let k=0;k<12;k++){const a=k/12*6.2832;v.beginPath();v.arc(cx+Math.cos(a)*r*.18,cy+Math.sin(a)*r*.18,Math.max(1.3,r*.035),0,7);v.fill();}}
 function stem(x,v,pts,w){x.lineWidth=w;x.beginPath();pts.forEach((p,i)=>i?x.lineTo(p[0],p[1]):x.moveTo(p[0],p[1]));x.stroke();
   v.lineWidth=Math.max(1,w*.22);v.beginPath();pts.forEach((p,i)=>i?v.lineTo(p[0],p[1]):v.moveTo(p[0],p[1]));v.stroke();}
 K['ornament.acanthus-frame']=j=>{const p=j.params,[c,x]=mk(),[cv,v]=mk(),[wl,wt,ww,wh]=j.zone.rect,wr=wl+ww,wb=wt+wh,ins=p.inset||58;
   const bxL=(ins+wl)/2,bxR=W-bxL,byT=(ins+wt)/2,byB=(wb+H-ins)/2,R=p.scroll||36,PI=Math.PI,cxm=W/2,st=p.step||230,o={fronds:p.fronds||4,frond:R*(p.frond||1.15),lobes:p.lobes||4};
   for(const xc of [bxL,bxR]){const pts=[];for(let y=wt+30;y<=wb-20;y+=4)pts.push([xc+12*Math.sin((y-wt-60)/st*3.1416),y]);stem(x,v,pts,6);
     let k=0;for(let y=wt+80;y<wb-40;y+=st/2,k++){const s=k%2?1:-1;scroll(x,v,xc+s*14,y+30,R,s>0?PI:0,1.2,s,o);}}
   for(const m of [1,-1]){x.save();v.save();x.translate(cxm,0);x.scale(m,1);v.translate(cxm,0);v.scale(m,1);
     const run=(by,from,to)=>{const pts=[];for(let xx=from;xx<=to;xx+=4)pts.push([xx,by+8*Math.sin((xx-from)/(p.step_h||135)*3.1416)]);stem(x,v,pts,5);
       let k=0;for(let xx=from+40;xx<to-20;xx+=p.step_h||135,k++){const s=k%2?1:-1;scroll(x,v,xx,by+s*10,R*.92,s>0?-PI/2:PI/2,1.2,s,o);}};
     run(byT,(p.rosette||50)+10,wr-cxm-30);run(byB,(p.plaque||225)+30,wr-cxm-30);
     scroll(x,v,(p.plaque||225)+6,byB,24,0,1.1,-1,{fronds:2,frond:30,lobes:3});
     const pl=p.plume||78;scroll(x,v,wr-cxm-pl*.9,wt+pl*.85,pl,-PI/4,1.3,-1,{fronds:5,frond:pl*1.1,lobes:5,stem:pl*.2});
     x.restore();v.restore();}
   for(const [ex,d] of [[wl+58,1],[wr-58,-1]])scroll(x,v,ex,wb-70,52,d>0?PI*.75:PI*.25,1.2,d,{fronds:4,frond:58,lobes:4});
   for(const [rx,ry,rr] of [[cxm,byT,p.rosette||50],[bxL,byT,42],[bxR,byT,42],[bxL,byB,42],[bxR,byB,42]])rosette(x,v,rx,ry,rr,10);
   return {'':c,veins:cv};};
