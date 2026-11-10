 /* ---- tiara filigree: stone-set teardrop loops, arched window outline, rhinestone chains ---- */
 function tear(px,py,ang,L,w,n=56){const ax=Math.cos(ang),ay=Math.sin(ang),cx=px+ax*L*.5,cy=py+ay*L*.5,pts=[];
   for(let k=0;k<=n;k++){const t=k/n*6.2832,lx=w*.5*Math.sin(t)*Math.pow(Math.abs(Math.sin(t/2)),1.6),ly=L*.5*Math.cos(t);pts.push([cx+ax*ly-ay*lx,cy+ay*ly+ax*lx]);}return pts;}
 const poly=(c,pts)=>{c.beginPath();pts.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.closePath();};
 function stonesAlong(c,pts,step,r){let acc=step/2;for(let i=1;i<pts.length;i++){const [x0,y0]=pts[i-1],[x1,y1]=pts[i],L=Math.hypot(x1-x0,y1-y0);let u=0;
   while(acc<=L-u){u+=acc;const t=u/L;c.beginPath();c.arc(x0+(x1-x0)*t,y0+(y1-y0)*t,r,0,7);c.fill();acc=step;}acc-=(L-u);}}
 function jewel(S,Hh,C,px,py,ang,L,w,sw){const o=tear(px,py,ang,L,w),ax=Math.cos(ang),ay=Math.sin(ang);
   S.lineWidth=sw;poly(S,o);S.stroke();
   poly(Hh,tear(px+ax*L*.09,py+ay*L*.09,ang,L*.8,w*.62));Hh.fill();
   stonesAlong(C,o,sw*2.3,sw*.55);
   if(L>70){const gx=px+ax*L*.3,gy=py+ay*L*.3,gr=w*.16;C.beginPath();C.arc(gx,gy,gr,0,7);C.fill();S.lineWidth=sw*.5;S.beginPath();S.arc(gx,gy,gr+sw*.5,0,7);S.stroke();
     Hh.save();Hh.globalCompositeOperation='destination-out';Hh.beginPath();Hh.arc(gx,gy,gr+sw,0,7);Hh.fill();Hh.restore();}}
 function ring(S,Hh,C,x,y,r,sw){S.lineWidth=sw;S.beginPath();S.arc(x,y,r,0,7);S.stroke();C.beginPath();C.arc(x,y,r*.55,0,7);C.fill();}
 function archPath(c,z,off){const [l,t,w,h]=z.rect,a=z.arch||0,r=z.r||0,cx=l+w/2,L=l-off,R=l+w+off,B=t+h+off;c.beginPath();c.moveTo(L,t+a);
   c.ellipse(cx,t+a,w/2+off,a+off,0,Math.PI,2*Math.PI);c.lineTo(R,B-r);c.quadraticCurveTo(R,B,R-r,B);c.lineTo(L+r,B);c.quadraticCurveTo(L,B,L,B-r);c.closePath();}
 K['ornament.tiara-filigree']=j=>{const p=j.params,z=j.zone,[l,t,w,h]=z.rect,a=z.arch||0,cx=l+w/2,[c,S]=mk(),[ch,Hh]=mk(),[cc,C]=mk(),sw=p.weight||7;
   S.lineWidth=5;archPath(S,z,16);S.stroke();S.lineWidth=2.5;archPath(S,z,34);S.stroke();
   // tiara band riding the arch, set with a row of stones
   const band=[];for(let k=0;k<=80;k++){const th=Math.PI*(1.12+.76*k/80);band.push([cx+Math.cos(th)*(w/2+25),t+a+Math.sin(th)*(a+25)]);}
   S.lineWidth=12;S.beginPath();band.forEach((q,i)=>i?S.lineTo(q[0],q[1]):S.moveTo(q[0],q[1]));S.stroke();stonesAlong(C,band,19,5.2);
   // crest: fan of teardrops standing on the band
   const archY=x=>t+a-(a+25)*Math.sqrt(Math.max(0,1-((x-cx)/(w/2+25))**2));
   const tears=p.crest||[[0,170,76],[1,140,62],[2,112,52],[3,86,44]];
   for(const [k,L,wd] of tears.slice().reverse())for(const s of (k?[-1,1]:[1])){const bx=cx+s*k*(p.spread||74),by=archY(bx)-10,ang=-Math.PI/2+s*k*(p.fan||.33);jewel(S,Hh,C,bx,by,ang,L,wd,sw);}
   for(const k of [.5,1.5,2.5])for(const s of [-1,1]){const bx=cx+s*k*(p.spread||74);ring(S,Hh,C,bx,archY(bx)-22,13,4);}
   // rhinestone chains down both margins
   for(const x of [l/2,W-l/2]){for(let y=t+a-20,k=0;y<t+h-30;y+=p.chain||118,k++){jewel(S,Hh,C,x,y+(k%2?0:58),k%2?Math.PI/2:-Math.PI/2,62,30,5);ring(S,Hh,C,x,y+(k%2?84:-26),12,4);}}
   // corner fans at the top corners
   for(const s of [1,-1]){const x0=s>0?44:W-44;for(const d of [-.42,0,.42]){const ang=Math.PI/4*(s>0?1:3)+d*s;jewel(S,Hh,C,x0,44,ang,70-Math.abs(d)*40,30,4);}}
   return {'':c,holes:ch,stones:cc};};
