 function rrPts(x0,y0,ww,hh,r){const P=[],seg=(ax,ay,bx,by)=>{for(let k=0;k<=40;k++)P.push([ax+(bx-ax)*k/40,ay+(by-ay)*k/40]);},
   arc=(qx,qy,a0)=>{for(let k=1;k<=16;k++){const t=a0+k/16*Math.PI/2;P.push([qx+Math.cos(t)*r,qy+Math.sin(t)*r]);}};
   seg(x0+r,y0,x0+ww-r,y0);arc(x0+ww-r,y0+r,-Math.PI/2);seg(x0+ww,y0+r,x0+ww,y0+hh-r);arc(x0+ww-r,y0+hh-r,0);
   seg(x0+ww-r,y0+hh,x0+r,y0+hh);arc(x0+r,y0+hh-r,Math.PI/2);seg(x0,y0+hh-r,x0,y0+r);arc(x0+r,y0+r,Math.PI);return P;}
 function archPts(z,off){const [l,t,w,h]=z.rect,a=z.arch||0,cx=l+w/2,P=[];for(let k=0;k<=120;k++){const th=Math.PI*(1+k/120);P.push([cx+Math.cos(th)*(w/2+off),t+a+Math.sin(th)*(a+off)]);}
   const R=l+w+off,B=t+h+off,L=l-off;for(let k=1;k<=60;k++)P.push([R,t+a+(B-t-a)*k/60]);for(let k=1;k<=60;k++)P.push([R-(R-L)*k/60,B]);for(let k=1;k<=60;k++)P.push([L,B-(B-t-a)*k/60]);return P;}
 K['ornament.tiara-filigree']=j=>{const p=j.params,z=j.zone,[l,t,w,h]=z.rect,a=z.arch||0,cx=l+w/2,[c,S]=mk(),[ch,Hh]=mk(),[cc,C]=mk(),sw=p.weight||7,sp=p.spread||74;
   // card border: double rule set with a row of stones
   const bi=p.border||26;S.lineWidth=3;S.beginPath();S.roundRect(bi,bi,W-2*bi,H-2*bi,38);S.stroke();S.lineWidth=1.6;S.beginPath();S.roundRect(bi+18,bi+18,W-2*bi-36,H-2*bi-36,26);S.stroke();
   stonesAlong(C,rrPts(bi+9,bi+9,W-2*bi-18,H-2*bi-18,32),23,4.3);
   // window: double outline with a stone row between
   S.lineWidth=5;archPath(S,z,16);S.stroke();S.lineWidth=2.5;archPath(S,z,40);S.stroke();stonesAlong(C,archPts(z,28),21,4.6);
   // tiara band
   const band=[];for(let k=0;k<=100;k++){const th=Math.PI*(1.08+.84*k/100);band.push([cx+Math.cos(th)*(w/2+52),t+a+Math.sin(th)*(a+52)]);}
   S.lineWidth=12;S.beginPath();band.forEach((q,i)=>i?S.lineTo(q[0],q[1]):S.moveTo(q[0],q[1]));S.stroke();stonesAlong(C,band,19,5.2);
   const archY=x=>t+a-(a+52)*Math.sqrt(Math.max(0,1-((x-cx)/(w/2+52))**2));
   const fan=p.fan||.28,crest=p.crest||[[0,176,104],[1,146,88],[2,116,74],[3,90,62],[4,66,48]];
   // second tier (behind): small loops between the main ones, each topped with a floating gem
   for(let k=.5;k<crest.length-1;k+=1)for(const s of [-1,1]){const bx=cx+s*k*sp,by=archY(bx)-8,ang=-Math.PI/2+s*k*fan;
     jewel(S,Hh,C,bx,by,ang,70-k*6,40-k*3,5);const tx=bx+Math.cos(ang)*(86-k*6),ty=by+Math.sin(ang)*(86-k*6);ring(S,Hh,C,tx,ty,11,3.5);}
   for(const [k,L,wd] of crest.slice().reverse())for(const s of (k?[-1,1]:[1])){const bx=cx+s*k*sp,by=archY(bx)-10,ang=-Math.PI/2+s*k*fan;jewel(S,Hh,C,bx,by,ang,L,wd,sw);}
   // scroll terminals where the crest meets the band
   for(const s of [-1,1]){const bx=cx+s*(crest.length-.3)*sp,by=archY(bx);curl(S,bx+s*18,by-14,26,s>0?Math.PI:0,1.2,s,5);curl(S,bx+s*58,by+16,18,s>0?Math.PI*1.2:-Math.PI*.2,1.1,s,4);}
   // side chains: teardrops, set rings and C-scrolls
   const mx=l/2+ (p.chain_offset||8);
   for(const x of [mx,W-mx]){for(let y=t+a-30,k=0;y<t+h-20;y+=p.chain||124,k++){
     jewel(S,Hh,C,x,y+(k%2?0:62),k%2?Math.PI/2:-Math.PI/2,66,34,5);const yr=y+(k%2?90:-28);ring(S,Hh,C,x,yr,13,4);
     curl(S,x-26,yr,12,0,1.05,1,3.4);curl(S,x+26,yr,12,Math.PI,1.05,-1,3.4);}}
   // corner fans, all four corners
   for(const [x0,y0,base] of [[56,56,Math.PI/4],[W-56,56,Math.PI*3/4],[56,H-56,-Math.PI/4],[W-56,H-56,-Math.PI*3/4]])
     for(const [d,L,wd] of [[-.62,62,30],[.62,62,30],[-.31,80,36],[.31,80,36],[0,98,42]])jewel(S,Hh,C,x0,y0,base+d,L,wd,4.5);
   // jewelled swag under the window with pendants
   if(p.swag!==false){const y0=t+h+64,sag=p.sag||34,sx=x=>y0+sag*(1-((x-cx)/(w/2-30))**2),pts=[];for(let x=l+30;x<=l+w-30;x+=4)pts.push([x,sx(x)]);
     S.lineWidth=2.6;S.beginPath();pts.forEach((q,i)=>i?S.lineTo(q[0],q[1]):S.moveTo(q[0],q[1]));S.stroke();stonesAlong(C,pts,20,6);
     jewel(S,Hh,C,cx,sx(cx)+4,Math.PI/2,p.pendant||64,40,5);for(const s of [-1,1]){const px=cx+s*210;jewel(S,Hh,C,px,sx(px)+4,Math.PI/2,44,28,4);ring(S,Hh,C,cx+s*105,sx(cx+s*105)+16,9,3);}}
   return {'':c,holes:ch,stones:cc};};
