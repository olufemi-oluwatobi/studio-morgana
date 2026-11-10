#!/usr/bin/env python3
"""
FANCARD STUDIO · master build script
====================================
Turns a card manifest (YAML) into:
  out/<id>/card.html          interactive tilt + flip card (3 baked light angles per side)
  out/<id>/preview-front.png  flat stills for review
  out/<id>/preview-back.png
  out/<id>/production/        one plate per factory operation + production.json

Usage
  python3 fancard.py MANIFEST [--patch PATCH ...] [--set path=value ...] [--out DIR]

Examples
  python3 fancard.py manifests/sienna-rae.card.yaml
  python3 fancard.py manifests/sienna-rae.card.yaml --patch manifests/sienna-rae.jade-cobalt.patch.yaml
  python3 fancard.py manifests/sienna-rae.card.yaml --set tokens.enamel.field.hex=#14213d \
        --set tokens.metal.plate.finish=silver --set components.corner.params.petals=7

Pipeline (each stage mirrors a real production step)
  1. load + merge  manifest ← patches ← --set overrides
  2. masks         components are drawn as white-on-transparent masks (Chromium canvas, real fonts)
  3. ops           brush → engrave → enamel → emboss → plate → print → foil, in manifest order,
                   building a height map and a stack of material layers
  4. light         height map → normals → shaded 3 times (left / centre / right)
  5. template      baked images + filtered photo injected into the card shell
Requires: python3 (numpy, scipy, pillow, pyyaml), node + playwright, @fontsource fonts.
"""
import argparse, base64, copy, io, json, os, re, subprocess, sys, tempfile
import numpy as np, yaml
from PIL import Image
from scipy.ndimage import gaussian_filter as G

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_DIRS = [os.environ.get('FANCARD_FONTS', ''), os.path.join(HERE, 'fonts'),
             os.path.join(HERE, 'node_modules/@fontsource'),
             os.path.join(HERE, '../test/node_modules/@fontsource')]

# ════════════════════════════════════════════════════════════════════════════
# MATERIAL LIBRARY · every colour on the card must be one of these processes
# ════════════════════════════════════════════════════════════════════════════
METALS = {                     # finish: (highlight, shadow)
    'gold-24k':          ('#f2c14e', '#a8701c'),
    'gold-yellow':       ('#ffc925', '#e89a10'),
    'rose-gold':         ('#f4b49a', '#9a5444'),
    'silver':            ('#f1f3f5', '#7c838b'),
    'copper':            ('#f0a070', '#8a3e1c'),
    'gunmetal':          ('#9aa0a8', '#2a2d31'),
    'black-chrome':      ('#3a3d44', '#050506'),
    'pvd-blue-titanium': ('#86b6ff', '#16307e'),
    'pvd-purple':        ('#c69bff', '#3d1a7a'),
    'yellow-foil':       ('#ffe14a', '#c99a00'),
    'lime-foil':         ('#efff7a', '#9db81c'),   # neon hot-foil
    'orange-foil':       ('#ffb066', '#c4480f'),
}
STOCKS = {                     # blank metals
    'brass':     ('#d9b56a', '#7a5a26'),
    'stainless': ('#d8dcdf', '#6e7479'),
    'aluminium': ('#e3e5e8', '#8a8f96'),
    'titanium':  ('#b7b2aa', '#5d5a55'),
    'anodized-navy':  ('#1d2c78', '#060b2a'),     # anodised aluminium, dyed
    'anodized-black': ('#3a3d44', '#0a0b0e'),
}
GRADES = {                     # photo filter presets (from the Cinematic Wash bake)
    'amber-sepia': dict(sepia=.42, sat=1.25, contrast=1.22, gain=.94, top='#ffc24a', bottom='#d8321f', wash=.62),
    'teal-cold':   dict(sepia=.0,  sat=.80,  contrast=1.18, gain=.96, top='#bff3ea', bottom='#0d4c5c', wash=.60),
    'rose':        dict(sepia=.20, sat=1.10, contrast=1.15, gain=.95, top='#ffd1c4', bottom='#8a2846', wash=.50),
    'night-blue':  dict(sepia=.0,  sat=.30, contrast=1.35, gain=1.02, top=None, bottom=None, wash=0),
    'night-flash': dict(sepia=.05, sat=1.12, contrast=1.22, gain=1.04, top=None, bottom=None, wash=0),
    'pop':         dict(sepia=.0,  sat=1.08, contrast=1.06, gain=1.02, top=None, bottom=None, wash=0),
    'silver-noir': dict(sepia=.0,  sat=.0,   contrast=1.28, gain=.97, top='#eef3f8', bottom='#151a21', wash=.35),
    'noir':        dict(sepia=.0,  sat=.0,   contrast=1.30, gain=.95, top=None, bottom=None, wash=0),
    'none':        dict(sepia=.0,  sat=1.0,  contrast=1.0,  gain=1.0, top=None, bottom=None, wash=0),
}
HOLO = {                       # holographic foils: hue shifts with light angle and relief
    'holo-rainbow': dict(tint=None,      tint_amt=0,   spread=.38, grain=.55),
    'holo-rose':    dict(tint='#ff5aa8', tint_amt=.55, spread=.32, grain=.25),
    'holo-ice':     dict(tint='#9fd8ff', tint_amt=.45, spread=.45, grain=.30),
    'holo-gold':    dict(tint='#ffc65a', tint_amt=.50, spread=.40, grain=.35),
}
GLASS = {                      # see-through blanks (tempered glass / optical acrylic)
    'glass-clear': dict(tint='#dfe9ee', alpha=.10),
    'glass-smoke': dict(tint='#3a3f47', alpha=.45),
    'glass-rose':  dict(tint='#f2b8c6', alpha=.22),
}
MIRRORS = {                    # polished, environment-reflecting finishes (chrome / PVD over polished steel)
    'mirror-chrome': '#e9eef3',
    'mirror-gold':   '#ffd27a',
    'mirror-black':  '#6c7380',
}
ENG_PER_MM = .25 / .12         # height units per mm of engraving
EMB_PER_MM = .9 / .08          # height units per mm of emboss

# ════════════════════════════════════════════════════════════════════════════
# 1 · MANIFEST LOADING
# ════════════════════════════════════════════════════════════════════════════
def merge(a, b):
    """Deep merge b onto a. A dict carrying a different `kind` replaces the old one outright."""
    if isinstance(a, dict) and isinstance(b, dict):
        if 'kind' in a and 'kind' in b and a['kind'] != b['kind']:
            return copy.deepcopy(b)
        out = dict(a)
        for k, v in b.items():
            out[k] = merge(a[k], v) if k in a else copy.deepcopy(v)
        return out
    return copy.deepcopy(b)

def set_path(d, path, value):
    parts = path.split('.')
    for p in parts[:-1]:
        d = d[int(p)] if isinstance(d, list) else d.setdefault(p, {})
    last = parts[-1]
    if isinstance(d, list): d[int(last)] = value
    else: d[last] = value

def get_path(d, path):
    for p in path.split('.'):
        d = d[int(p)] if isinstance(d, list) else d[p]
    return d

def fill_text(s, M):
    """'{edition.no:03}' → '019'"""
    def rep(m):
        v = get_path(M, m.group(1))
        return format(v, m.group(2)) if m.group(2) else str(v)
    return re.sub(r'\{([\w.]+)(?::([^}]*))?\}', rep, s)

def deep_fill(o, M):
    if isinstance(o, str): return fill_text(o, M) if '{' in o else o
    if isinstance(o, list): return [deep_fill(v, M) for v in o]
    if isinstance(o, dict): return {k: deep_fill(v, M) for k, v in o.items()}
    return o

def load(manifest, patches, sets):
    M = yaml.safe_load(open(manifest))
    for p in patches:
        M = merge(M, yaml.safe_load(open(p)))
    for s in sets:
        k, v = s.split('=', 1)
        val = yaml.safe_load(v)
        set_path(M, k, v if val is None and v else val)
    return M

# ════════════════════════════════════════════════════════════════════════════
# 2 · MASK RENDERER (runs in Chromium so type uses the real fonts)
# Ornament vocabulary ported from masks6.js (Cinematic Wash). All units are px.
# ════════════════════════════════════════════════════════════════════════════
MASKS_JS = r"""
const {chromium}=require('playwright');const fs=require('fs');
const [specPath,outDir]=process.argv.slice(2);const spec=JSON.parse(fs.readFileSync(specPath,'utf8'));
for(const k in spec.fonts)spec.fonts[k].b64=fs.readFileSync(spec.fonts[k].path).toString('base64');
(async()=>{const b=await chromium.launch();const p=await b.newPage();
const out=await p.evaluate(async(S)=>{
 for(const k in S.fonts){const f=S.fonts[k];const ff=new FontFace(k,`url(data:font/woff2;base64,${f.b64})`,{weight:String(f.weight),style:f.style});await ff.load();document.fonts.add(ff);}
 const W=S.W,H=S.H,U=1080,res={};
 const mk=()=>{const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.fillStyle='#fff';x.strokeStyle='#fff';x.lineCap='round';x.lineJoin='round';x.textAlign='center';x.textBaseline='alphabetic';return [c,x];};
 const font=(k,size)=>{const f=S.fonts[k];return `${f.style} ${f.weight} ${size}px "${k}"`;};
 /* ---- vocabulary ---- */
 function curl(x,cx,cy,r,a0,turns,dir,w){const n=60;x.beginPath();for(let i=0;i<=n;i++){const t=i/n,a=a0+dir*t*turns*6.283,rr=r*(1-.82*t);const px=cx+Math.cos(a)*rr,py=cy+Math.sin(a)*rr;i?x.lineTo(px,py):x.moveTo(px,py);}
   x.lineWidth=w;x.stroke();const ae=a0+dir*turns*6.283;x.beginPath();x.arc(cx+Math.cos(ae)*r*.18,cy+Math.sin(ae)*r*.18,w*.9,0,7);x.fill();}
 function leaf(x,px,py,ang,len,wid){const c=Math.cos(ang),s=Math.sin(ang),nx=-s,ny=c;x.beginPath();x.moveTo(px,py);
   x.quadraticCurveTo(px+c*len*.5+nx*wid,py+s*len*.5+ny*wid,px+c*len,py+s*len);x.quadraticCurveTo(px+c*len*.5-nx*wid,py+s*len*.5-ny*wid,px,py);x.fill();}
 function rrect(x,l,t,r,b,rad,w){x.lineWidth=w;x.beginPath();x.roundRect(l,t,r-l,b-t,rad);x.stroke();}
 function corners(x,draw){for(const [sx,sy] of [[1,1],[-1,1],[1,-1],[-1,-1]]){x.save();x.translate(sx<0?W:0,sy<0?H:0);x.scale(sx,sy);draw(x);x.restore();}}
 function vine(x,x0,y0,x1,y1,amp,per){const L=Math.hypot(x1-x0,y1-y0),ux=(x1-x0)/L,uy=(y1-y0)/L,nx=-uy,ny=ux,N=300;
   x.lineWidth=.0034*U;x.beginPath();for(let i=0;i<=N;i++){const s=i/N*L,o=amp*Math.sin(s/per*6.283);const px=x0+ux*s+nx*o,py=y0+uy*s+ny*o;i?x.lineTo(px,py):x.moveTo(px,py);}x.stroke();
   for(let s=per*.25,k=0;s<L-10;s+=per/2,k++){const side=k%2?1:-1,o=amp*side;const px=x0+ux*s+nx*o,py=y0+uy*s+ny*o;
     curl(x,px+nx*side*.0105*U+ux*.006*U,py+ny*side*.0105*U+uy*.006*U,.0085*U,Math.atan2(uy,ux)+(side>0?1.6:-1.6),1.1,side,.0026*U);
     leaf(x,px,py,Math.atan2(uy-ny*side*.6,ux-nx*side*.6)+3.14,.022*U,.0055*U);}}
 function clipField(x,j){const [l,t,w,h]=j.field.rect;x.beginPath();x.roundRect(l,t,w,h,j.field.r||0);x.clip();}
 function exclude(x,j){if(!j.exclude)return;const e=j.exclude,m=j.margin||0;x.save();x.globalCompositeOperation='destination-out';x.beginPath();x.ellipse(e.center[0],e.center[1],e.rx+m,e.ry+m,0,0,7);x.fill();x.restore();}
 /* ---- component kinds ---- */
 const K={};
 K['frame.double-rule']=j=>{const p=j.params,[c,x]=mk(),i=p.inset,g=p.gap,w=p.weight||[6,3.8];
   rrect(x,i,i,W-i,H-i,p.radius,w[0]);rrect(x,i+g,i+g,W-i-g,H-i-g,p.radius*.45,w[1]);return {'':c};};
 K['ornament.palmette-fan']=j=>{const p=j.params,[c,x]=mk(),n=p.petals||5,sp=(p.spread_deg||69)*Math.PI/180,step=n>1?sp/(n-1):0,L=(p.length||108)/108,cs=p.curl??1,c0=.07*U;
   corners(x,x=>{x.lineWidth=.0045*U;
     x.beginPath();x.moveTo(.062*U,.105*U);x.bezierCurveTo(.075*U,.05*U,.17*U,.04*U,.215*U,.068*U);x.stroke();curl(x,.205*U,.088*U,.02*U*cs,-1.2,1.15,1,.0042*U);
     x.beginPath();x.moveTo(.105*U,.062*U);x.bezierCurveTo(.05*U,.075*U,.04*U,.17*U,.068*U,.215*U);x.stroke();curl(x,.088*U,.205*U,.02*U*cs,-.4,1.15,-1,.0042*U);
     for(let i=0;i<n;i++){const k=i-(n-1)/2;leaf(x,c0,c0,.785+k*step,(.1-Math.abs(k)*.016)*U*L,.017*U);}
     x.globalCompositeOperation='destination-out';x.lineWidth=.0024*U;
     for(let i=0;i<n;i++){const k=i-(n-1)/2,a=.785+k*step,l=(.09-Math.abs(k)*.016)*U*L;x.beginPath();x.moveTo(c0+Math.cos(a)*.02*U,c0+Math.sin(a)*.02*U);x.lineTo(c0+Math.cos(a)*l,c0+Math.sin(a)*l);x.stroke();}
     x.globalCompositeOperation='source-over';
     if(p.rivet!==false){x.beginPath();x.arc(c0,c0,.016*U,0,7);x.fill();}
     curl(x,.142*U,.142*U,.016*U*cs,2.3,1.1,1,.0036*U);leaf(x,.215*U,.068*U,.2,.035*U,.008*U);leaf(x,.068*U,.215*U,1.37,.035*U,.008*U);});
   return {'':c};};
 K['ornament.art-deco-sunburst']=j=>{const p=j.params,[c,x]=mk(),n=p.rays||11,sp=(p.spread_deg||80)*Math.PI/180,c0=.07*U,a0=.785-sp/2;
   corners(x,x=>{x.lineWidth=.0042*U;
     x.beginPath();x.moveTo(c0,c0);x.lineTo(.235*U,c0);x.stroke();x.beginPath();x.moveTo(c0,c0);x.lineTo(c0,.235*U);x.stroke();
     for(const [yy,len] of [[.085,.17],[.1,.125]]){x.lineWidth=.0026*U;x.beginPath();x.moveTo(c0+.03*U,yy*U);x.lineTo((.06+len)*U,yy*U);x.stroke();x.beginPath();x.moveTo(yy*U,c0+.03*U);x.lineTo(yy*U,(.06+len)*U);x.stroke();}
     for(let i=0;i<n;i++){const a=a0+sp*i/(n-1),lg=i%2===0,r0=.03*U,r1=(lg?.15:.105)*U,w=(lg?.016:.010)*U,cc=Math.cos(a),ss=Math.sin(a),nx=-ss,ny=cc;
       x.beginPath();x.moveTo(c0+cc*r0+nx*w/2,c0+ss*r0+ny*w/2);x.lineTo(c0+cc*r1,c0+ss*r1);x.lineTo(c0+cc*r0-nx*w/2,c0+ss*r0-ny*w/2);x.closePath();x.fill();
       if(lg){x.beginPath();x.arc(c0+cc*(r1+.009*U),c0+ss*(r1+.009*U),.0042*U,0,7);x.fill();}}
     x.lineWidth=.003*U;for(const r of [.055,.12]){x.beginPath();x.arc(c0,c0,r*U,a0,a0+sp);x.stroke();}
     x.beginPath();x.arc(c0,c0,.018*U,0,7);x.fill();
     x.globalCompositeOperation='destination-out';x.beginPath();x.arc(c0,c0,.008*U,0,7);x.fill();x.globalCompositeOperation='source-over';});
   return {'':c};};
 K['border.wave-scroll']=j=>{const p=j.params,[c,x]=mk(),o=p.offset,m=p.margin,a=p.amplitude,per=p.period;
   vine(x,m,o,W-m,o,a,per);vine(x,m,H-o,W-m,H-o,a,per);vine(x,o,m,o,H-m,a,per);vine(x,W-o,m,W-o,H-m,a,per);return {'':c};};
 K['frame.oval-cartouche']=j=>{const p=j.params,z=j.zone,[cx,cy]=z.center,rx=z.rx,ry=z.ry,b=p.border||4.3;
   const [c,x]=mk();x.lineWidth=b;x.beginPath();x.ellipse(cx,cy,rx,ry,0,0,7);x.stroke();x.lineWidth=b*.55;x.beginPath();x.ellipse(cx,cy,rx-13,ry-9,0,0,7);x.stroke();
   const d=rx+22;curl(x,cx-d,cy,17,0,1.1,1,3.7);x.save();x.translate(2*cx,0);x.scale(-1,1);curl(x,cx-d,cy,17,0,1.1,1,3.7);x.restore();
   const [c2,x2]=mk();x2.beginPath();x2.ellipse(cx,cy,rx-2,ry-2,0,0,7);x2.fill();
   const [c3,x3]=mk();x3.font=font(p.font||'serif',p.size||52);x3.fillText(p.text||'',cx,cy+(p.size||52)*.31);
   return {'':c,fill:c2,text:c3};};
 K['ornament.palmette-finial']=j=>{const p=j.params,[c,x]=mk(),[cx,cy]=j.zone.center,n=p.petals||5,L=p.length||43;
   for(let i=0;i<n;i++){const k=i-(n-1)/2;leaf(x,cx,cy,-1.571+k*.32,L-Math.abs(k)*L*.175,L*.2);}return {'':c};};
 K['frame.oval-medallion']=j=>{const p=j.params,[c,x]=mk(),z=j.zone,[cx,cy]=z.center,rx=z.rx,ry=z.ry,n=p.dots||64;
   x.lineWidth=p.ring||6;x.beginPath();x.ellipse(cx,cy,rx,ry,0,0,7);x.stroke();
   x.lineWidth=2.6;x.beginPath();x.ellipse(cx,cy,rx-24,ry-24,0,0,7);x.stroke();
   for(let i=0;i<n;i++){const a=i/n*6.283;x.beginPath();x.arc(cx+Math.cos(a)*(rx-12),cy+Math.sin(a)*(ry-12),3,0,7);x.fill();}
   for(const sg of[-1,1]){x.save();x.translate(cx,cy);x.scale(sg,1);curl(x,0,-(ry+49),24,1.2,1.1,1,3.9);x.restore();}
   for(let i=-3;i<=3;i++)leaf(x,cx,cy-(ry-16),-1.571+i*.28,54-Math.abs(i)*9.7,9.7);
   for(let i=-3;i<=3;i++)leaf(x,cx,cy+(ry-16),1.571+i*.28,54-Math.abs(i)*9.7,9.7);
   return {'':c};};
 K['pattern.ogee']=j=>{const p=j.params,[c,x]=mk(),PX=p.period_x,PY=p.period_y,A=p.amplitude,nd=p.node||23;
   x.save();clipField(x,j);x.lineWidth=p.line||2.8;
   for(let cx=-PX;cx<W+PX;cx+=PX)for(const sg of[1,-1]){x.beginPath();for(let i=0;i<=400;i++){const y=i/400*H,xx=cx+sg*A*Math.sin(y/PY*6.283);i?x.lineTo(xx,y):x.moveTo(xx,y);}x.stroke();}
   for(let cx=-PX;cx<W+PX;cx+=PX)for(let y=0;y<H+PY;y+=PY)for(const [ox,oy] of [[PX/2,PY/2],[0,0]]){
     for(let k=0;k<4;k++)leaf(x,cx+ox,y+oy,k*1.571,nd,nd*.52);x.beginPath();x.arc(cx+ox,y+oy,nd*.21,0,7);x.fill();}
   x.restore();exclude(x,j);return {'':c};};
 K['pattern.guilloche']=j=>{const p=j.params,[c,x]=mk(),[l,t,w,h]=j.field.rect,B=p.bands||14,Wv=p.waves||6,lam=p.wavelength||180,bh=h/B;
   x.save();clipField(x,j);x.lineWidth=p.line||2;
   for(let b=-1;b<=B;b++){const y0=t+bh*(b+.5);for(let k=0;k<Wv;k++){const ph=k*6.283/Wv;x.beginPath();
     for(let xx=l-10;xx<=l+w+10;xx+=3){const y=y0+bh*.55*Math.sin(xx/lam*6.283+ph)*Math.cos((xx-l)/w*3.1416*2+b);xx===l-10?x.moveTo(xx,y):x.lineTo(xx,y);}x.stroke();}}
   x.restore();exclude(x,j);return {'':c};};
 K['type.stack']=j=>{const [c,x]=mk(),[cx,cy]=j.zone.center;
   for(const ln of j.lines){x.font=font(ln.font,ln.size);x.letterSpacing=(ln.track||0)+'px';x.fillText(ln.text,cx+(ln.track||0)/2,cy+ln.dy);}x.letterSpacing='0px';return {'':c};};
 K['type.signature']=j=>{const [c,x]=mk(),z=j.zone,p=j.params,f=p.font||'script';let s=z.size;
   x.font=font(f,s);while(x.measureText(p.text).width>z.max_width&&s>8){s-=.5;x.font=font(f,s);}
   x.save();x.translate(z.center[0],z.center[1]);x.rotate((z.rotate_deg||0)*Math.PI/180);x.fillText(p.text,0,0);x.restore();return {'':c};};
 /* ---- shape.draw: generic primitives (line, rect, circle, text, ring-text, waves, sparkle, perforated, hatch, rosette) ---- */
 function rpath(x,i){const [l,t,w,h]=i.rect,ch=i.chamfer||{};if(!Object.keys(ch).length){x.beginPath();x.roundRect(l,t,w,h,i.r||0);return;}
   const r=l+w,b=t+h,c=k=>ch[k]||0;x.beginPath();x.moveTo(l+c('tl'),t);x.lineTo(r-c('tr'),t);x.lineTo(r,t+c('tr'));x.lineTo(r,b-c('br'));x.lineTo(r-c('br'),b);x.lineTo(l+c('bl'),b);x.lineTo(l,b-c('bl'));x.lineTo(l,t+c('tl'));x.closePath();}
 const up=(i,t)=>i.upper?t.toUpperCase():t;
 const D={
  line:(x,i)=>{x.beginPath();x.moveTo(...i.from);x.lineTo(...i.to);x.stroke();},
  rect:(x,i)=>{rpath(x,i);i.fill?x.fill():x.stroke();},
  circle:(x,i)=>{x.beginPath();x.arc(i.c[0],i.c[1],i.r,0,7);i.fill?x.fill():x.stroke();},
  text:(x,i)=>{const t=up(i,i.text||'');if(!t)return;let s=i.size;x.font=font(i.font,s);x.letterSpacing=(i.track||0)+'px';
    if(i.max_width)while(x.measureText(t).width>i.max_width&&s>6){s-=.5;x.font=font(i.font,s);}
    x.textAlign=i.align||'center';x.translate(i.at[0],i.at[1]);x.rotate((i.rotate||0)*Math.PI/180);i.outline?x.strokeText(t,0,0):x.fillText(t,0,0);},
  para:(x,i)=>{const t=up(i,i.text||'');x.font=font(i.font,i.size);x.textAlign='left';const [l,tp,w]=i.rect,ld=i.leading||i.size*1.35;let line='',y=tp+i.size;
    for(const wd of t.split(/\s+/)){const tt=line?line+' '+wd:wd;if(x.measureText(tt).width>w&&line){x.fillText(line,l,y);line=wd;y+=ld;}else line=tt;}if(line)x.fillText(line,l,y);},
  barcode:(x,i)=>{let s=i.seed||1;const rnd=()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
    const [l,t,w,h]=i.rect,u=i.unit||2.5;let xx=l;while(xx<l+w-u){const bw=(1+Math.floor(rnd()*3))*u;x.fillRect(xx,t,Math.min(bw,l+w-xx),h);xx+=bw+(1+Math.floor(rnd()*2.5))*u;}},
  'ring-text':(x,i)=>{const t=up(i,i.text||'');if(!t)return;x.font=font(i.font,i.size);x.textAlign='center';const ws=[...t].map(ch=>x.measureText(ch).width);
    const tot=ws.reduce((a,b)=>a+b,0)/i.r,gap=i.fill_circle===false?(i.track||0)/i.r:(6.2832-tot)/ws.length;let a=(i.start_deg??-90)*Math.PI/180;
    [...t].forEach((ch,k)=>{const da=ws[k]/i.r;a+=da/2;x.save();x.translate(i.c[0]+Math.cos(a)*i.r,i.c[1]+Math.sin(a)*i.r);x.rotate(a+1.5708);x.fillText(ch,0,0);x.restore();a+=da/2+gap;});},
  waves:(x,i)=>{const [l,t,w,h]=i.rect,n=i.lines||5;for(let k=0;k<n;k++){const y0=t+k*h/(n-1);x.beginPath();for(let xx=l;xx<=l+w;xx+=2){const y=y0+i.amp*Math.sin((xx-l)/i.period*6.2832);xx===l?x.moveTo(xx,y):x.lineTo(xx,y);}x.stroke();}},
  sparkle:(x,i)=>{const [cx,cy]=i.at,s=i.size,k=s*.13;x.beginPath();x.moveTo(cx,cy-s);x.quadraticCurveTo(cx+k,cy-k,cx+s*.62,cy);x.quadraticCurveTo(cx+k,cy+k,cx,cy+s);
    x.quadraticCurveTo(cx-k,cy+k,cx-s*.62,cy);x.quadraticCurveTo(cx-k,cy-k,cx,cy-s);x.fill();},
  perforated:(x,i)=>{const [l,t,w,h]=i.rect,st=i.step||18,r=i.hole||6;x.fillRect(l,t,w,h);x.globalCompositeOperation='destination-out';
    const nx=Math.round(w/st),ny=Math.round(h/st);for(let k=0;k<=nx;k++)for(const y of[t,t+h]){x.beginPath();x.arc(l+k*w/nx,y,r,0,7);x.fill();}
    for(let k=0;k<=ny;k++)for(const xx of[l,l+w]){x.beginPath();x.arc(xx,t+k*h/ny,r,0,7);x.fill();}x.globalCompositeOperation='source-over';},
  hatch:(x,i)=>{const [l,t,w,h]=i.rect,st=i.step||10,a=(i.angle??-45)*Math.PI/180,ca=Math.cos(a),sa=Math.sin(a),cx=l+w/2,cy=t+h/2,D=Math.hypot(w,h);x.beginPath();x.rect(l,t,w,h);x.clip();
    for(let s=-D/2;s<=D/2;s+=st){const px=cx-sa*s,py=cy+ca*s;x.beginPath();x.moveTo(px-ca*D,py-sa*D);x.lineTo(px+ca*D,py+sa*D);x.stroke();}},
  scatter:(x,i)=>{let s=i.seed||1;const rnd=()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};const [l,t,w,h]=i.rect;
    for(let k=0;k<i.count;k++){const px=l+rnd()*w,py=t+rnd()*h,r=i.r[0]+rnd()*(i.r[1]-i.r[0]);x.beginPath();x.arc(px,py,r,0,7);x.fill();}},
  path:(x,i)=>{const s=i.scale||1;x.translate(...(i.at||[0,0]));x.scale(s,s);x.lineWidth=(i.w||3)/s;const P=new Path2D(i.d);i.fill?x.fill(P,'evenodd'):x.stroke(P);},
  pixelart:(x,i)=>{const s=i.px||6;i.rows.forEach((r,y)=>[...r].forEach((ch,k)=>{if(ch!=='.'&&ch!==' ')x.fillRect(i.at[0]+k*s,i.at[1]+y*s,s*(i.fill_gap??1),s*(i.fill_gap??1));}));},
  dotline:(x,i)=>{const [a,b]=[i.from,i.to],L=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.floor(L/(i.step||10));for(let k=0;k<=n;k++){x.beginPath();x.arc(a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n,i.r||1.6,0,7);x.fill();}},
  seg7:(x,i)=>{const t=i.text,h=i.h,w=h*.5,gap=i.gap??.28,P={a:[[0,0],[1,0]],b:[[1,0],[1,.5]],c:[[1,.5],[1,1]],d:[[0,1],[1,1]],e:[[0,.5],[0,1]],f:[[0,0],[0,.5]],g:[[0,.5],[1,.5]]},
    S={'0':'abcdef','1':'bc','2':'abged','3':'abgcd','4':'fgbc','5':'afgcd','6':'afgedc','7':'abc','8':'abcdefg','9':'abcdfg','-':'g',' ':''};
    const tot=[...t].reduce((a,ch)=>a+(ch==="'"?w*.45:w*(1+gap)),0)-w*gap;let cx=i.at[0]-(i.align==='right'?tot:i.align==='center'?tot/2:0);const y=i.at[1];
    x.lineWidth=i.w||h*.13;x.lineCap='round';
    for(const ch of t){if(ch==="'"){x.beginPath();x.moveTo(cx+w*.2,y);x.lineTo(cx+w*.08,y+h*.18);x.stroke();cx+=w*.45;continue;}
      const on=S[ch]||'';for(const sg of 'abcdefg'){if(!on.includes(sg)&&!i.ghost)continue;const [[u0,v0],[u1,v1]]=P[sg],k=.16,ax=u0+(u1-u0)*k,ay=v0+(v1-v0)*k,bx=u1-(u1-u0)*k,by=v1-(v1-v0)*k;
        x.globalAlpha=on.includes(sg)?1:(i.ghost||0);x.beginPath();x.moveTo(cx+ax*w-ay*h*.1+h*.05,y+ay*h);x.lineTo(cx+bx*w-by*h*.1+h*.05,y+by*h);x.stroke();}
      x.globalAlpha=1;cx+=w*(1+gap);}},
  grid3d:(x,i)=>{const [l,t,w,h]=i.rect,vx=l+w/2,hy=t;x.beginPath();x.rect(l,t,w,h);x.clip();const nv=i.lines_v||14,nh=i.lines_h||8;
    for(let k=-nv;k<=nv;k++){x.beginPath();x.moveTo(vx+k*w/nv*.08,hy);x.lineTo(vx+k*w/nv*1.4,t+h);x.stroke();}
    for(let k=1;k<=nh;k++){const y=hy+h*Math.pow(k/nh,1.9);x.beginPath();x.moveTo(l,y);x.lineTo(l+w,y);x.stroke();}},
  pixels:(x,i)=>{let s=i.seed||1;const rnd=()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
    const [l,t,w,h]=i.rect,cx=l+w/2,ps=i.size||7;for(let k=0;k<i.count;k++){const u=rnd()*2-1,mound=1-u*u,v=Math.pow(rnd(),i.falloff||2.2);
      if(rnd()>mound*1.1)continue;const px=cx+u*w/2,py=t+h-(v*h*mound),sz=rnd()<.3?ps*.55:ps;x.fillRect(Math.round(px/ps)*ps,Math.round(py/ps)*ps,sz,sz);}},
  'stone-ring':(x,i)=>{for(let k=0;k<i.n;k++){const a=k/i.n*6.2832;x.beginPath();x.arc(i.c[0]+Math.cos(a)*i.rx,i.c[1]+Math.sin(a)*i.ry,i.r,0,7);x.fill();}},
  ellipse:(x,i)=>{x.beginPath();x.ellipse(i.c[0],i.c[1],i.rx,i.ry,0,0,7);i.fill?x.fill():x.stroke();},
  rosette:(x,i)=>{const [cx,cy]=i.c,rm=(i.r0+i.r1)/2,rr=(i.r1-i.r0)/2,n=i.count||72;for(let k=0;k<n;k++){const a=k/n*6.2832;x.beginPath();x.arc(cx+Math.cos(a)*rm,cy+Math.sin(a)*rm,rr,0,7);x.stroke();}},
 };
 /* ---- acanthus: tapered spiral stems carrying separate lobed fronds; veins/outlines go to a second (niello) mask ---- */
 const occl=(v,path)=>{v.save();v.globalCompositeOperation='destination-out';path(v);v.fill();v.restore();};
 function frond(x,v,ox,oy,ang,L,bend,lobes,side){const N=64,C=[],Nn=[],WL=[],WR=[];let px=ox,py=oy,a=ang;const ds=L/N;
   for(let i=0;i<=N;i++){const u=i/N;C.push([px,py]);Nn.push([-Math.sin(a)*side,Math.cos(a)*side]);
     const w=L*.44*Math.pow(Math.sin(Math.PI*Math.min(1,Math.pow(u,.55))),.85)*(1-.2*u),f=(u*lobes)%1,tooth=Math.pow(f,1.7);
     WL.push(w*(.42+.8*tooth)*Math.min(1,u/.1));WR.push(w*.4*Math.min(1,u/.1));
     a+=bend*(1+3*u*u)/N;px+=Math.cos(a)*ds;py+=Math.sin(a)*ds;}
   const path=c=>{c.beginPath();for(let i=0;i<=N;i++){const X=C[i][0]+Nn[i][0]*WL[i],Y=C[i][1]+Nn[i][1]*WL[i];i?c.lineTo(X,Y):c.moveTo(X,Y);}
     for(let i=N;i>=0;i--)c.lineTo(C[i][0]-Nn[i][0]*WR[i],C[i][1]-Nn[i][1]*WR[i]);c.closePath();};
   path(x);x.fill();occl(v,path);const lw=Math.max(.9,L*.017);v.lineWidth=lw;path(v);v.stroke();
   v.beginPath();for(let i=0;i<=N*.9;i++){i?v.lineTo(C[i][0],C[i][1]):v.moveTo(C[i][0],C[i][1]);}v.stroke();
   for(let k=1;k<=lobes;k++){const i=Math.min(N,Math.round((k/lobes-.03)*N));if(i<6)continue;const j=Math.max(0,i-Math.round(N/lobes*.7));
     v.beginPath();v.moveTo(C[j][0],C[j][1]);v.quadraticCurveTo(C[i][0]+Nn[i][0]*WL[i]*.25,C[i][1]+Nn[i][1]*WL[i]*.25,C[i][0]+Nn[i][0]*WL[i]*.88,C[i][1]+Nn[i][1]*WL[i]*.88);v.stroke();
     const g=Math.min(N,Math.round(k/lobes*N)+2);if(k<lobes){v.beginPath();v.ellipse(C[g][0]+Nn[g][0]*WL[g]*.6,C[g][1]+Nn[g][1]*WL[g]*.6,lw*1.3,lw*2.6,Math.atan2(Nn[g][1],Nn[g][0]),0,7);v.fill();}}
   v.lineWidth=lw*.6;for(let i=6;i<N*.86;i+=4){v.beginPath();v.moveTo(C[i][0]-Nn[i][0]*WR[i]*.92,C[i][1]-Nn[i][1]*WR[i]*.92);v.lineTo(C[i][0]-Nn[i][0]*WR[i]*.25,C[i][1]-Nn[i][1]*WR[i]*.25);v.stroke();}}
 function scroll(x,v,cx,cy,R,a0,turns,dir,o={}){const n=170,P=[],Ws=o.stem||R*.22,F=o.fronds??4,Lf=o.frond||R*1.15,lb=o.lobes||4;
   for(let i=0;i<=n;i++){const t=i/n,a=a0+dir*turns*6.2832*t,r=R*Math.exp(-1.45*t);P.push([cx+Math.cos(a)*r,cy+Math.sin(a)*r,a,t]);}
   const w=t=>Ws*(1-.62*t)*.5;
   const sp=c=>{c.beginPath();P.forEach((p,i)=>{const X=p[0]+Math.cos(p[2])*w(p[3]),Y=p[1]+Math.sin(p[2])*w(p[3]);i?c.lineTo(X,Y):c.moveTo(X,Y);});
     for(let i=n;i>=0;i--){const p=P[i];c.lineTo(p[0]-Math.cos(p[2])*w(p[3]),p[1]-Math.sin(p[2])*w(p[3]));}c.closePath();};
   sp(x);x.fill();occl(v,sp);v.lineWidth=Math.max(1,Ws*.09);sp(v);v.stroke();
   v.beginPath();P.forEach((p,i)=>{if(p[3]>.88)return;i?v.lineTo(p[0],p[1]):v.moveTo(p[0],p[1]);});v.stroke();
   const e=P[n],er=Ws*.8;x.beginPath();x.arc(e[0],e[1],er,0,7);x.fill();occl(v,c=>{c.beginPath();c.arc(e[0],e[1],er,0,7);});
   v.beginPath();v.arc(e[0],e[1],er,0,7);v.stroke();v.beginPath();v.arc(e[0],e[1],er*.38,0,7);v.fill();
   for(let k=F-1;k>=0;k--){const t=.03+k*(.62/F),p=P[Math.round(t*n)],ox=Math.cos(p[2]),oy=Math.sin(p[2]),ta=p[2]+dir*Math.PI/2;
     const fx=Math.cos(ta),fy=Math.sin(ta),ang=Math.atan2(oy*.55+fy*.85,ox*.55+fx*.85);
     frond(x,v,p[0]+ox*w(t),p[1]+oy*w(t),ang,Lf*(1-.45*t),dir*(o.bend??1.1),lb,o.side??dir);}}
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
 K['shape.draw']=j=>{const [c,x]=mk();for(const it of j.items){if(!D[it.type])throw new Error('unknown primitive: '+it.type);x.save();x.lineWidth=it.w||2;D[it.type](x,it);x.restore();}return {'':c};};
 K['artwork']=async j=>{const out={},doc=new DOMParser().parseFromString(j.svg,'image/svg+xml'),ids=Object.values(j.layers).map(v=>v.replace('#',''));
   for(const [sub,ref] of Object.entries(j.layers)){const d=doc.cloneNode(true);
     for(const id of ids){const el=d.getElementById(id);if(el&&id!==ref.replace('#',''))el.remove();}
     const svg=new XMLSerializer().serializeToString(d),img=new Image();img.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg)));await img.decode();
     const [c,x]=mk();x.drawImage(img,0,0,W,H);out[sub==='fill'?'':sub]=c;}
   return out;};
 for(const j of S.jobs){if(!K[j.kind])throw new Error('unknown component kind: '+j.kind);const r=await K[j.kind](j);for(const sub in r)res[j.name+(sub?'-'+sub:'')]=r[sub].toDataURL();}
 return res;
},spec);
for(const k in out)fs.writeFileSync(`${outDir}/${k}.png`,Buffer.from(out[k].split(',')[1],'base64'));
await b.close();})().catch(e=>{console.error(e);process.exit(1);});
"""

def find_font(t):
    fam = t['family']; slug = fam.lower().replace(' ', '-')
    w = str(t.get('weight', 400)); st = t.get('style', 'normal')
    for d in FONT_DIRS:
        if not d: continue
        p = os.path.join(d, slug, 'files', f'{slug}-latin-{w}-{st}.woff2')
        if os.path.exists(p): return p
    sys.exit(f'font not found: {fam} {w} {st} (set FANCARD_FONTS to your @fontsource folder)')

def render_masks(M, jobs, workdir):
    fonts = {k: dict(path=find_font(v), weight=v.get('weight', 400), style=v.get('style', 'normal'))
             for k, v in M['tokens']['type'].items()}
    W, HP = M['blank']['grid']
    spec = dict(W=W, H=HP, fonts=fonts, jobs=jobs)
    sp = os.path.join(workdir, 'spec.json'); js = os.path.join(workdir, 'masks.js')
    json.dump(spec, open(sp, 'w')); open(js, 'w').write(MASKS_JS)
    subprocess.run(['node', js, sp, workdir], check=True)

# ════════════════════════════════════════════════════════════════════════════
# 3 · RASTER HELPERS (from bake5/bake6)
# ════════════════════════════════════════════════════════════════════════════
class Grid:
    def __init__(s, W, HP):
        s.W, s.HP, s.H = W, HP, HP / W
        xs = (np.arange(W) + .5) / W; ys = (np.arange(HP) + .5) / W
        s.X, s.Y = [a.astype('f4') for a in np.meshgrid(xs, ys)]
    def rr(s, cx, cy, hx, hy, r):
        qx = np.abs(s.X - cx) - hx + r; qy = np.abs(s.Y - cy) - hy + r
        return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r
    def band(s, c, w):
        v = s.X * .927 + s.Y * .375; return np.exp(-((v - c) / w) ** 2)

def ss(a, b, v): t = np.clip((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
u8 = lambda a: (np.clip(a, 0, 1) * 255 + .5).astype('u1')
def hexc(h): return np.array([int(h[k:k + 2], 16) / 255 for k in (1, 3, 5)], 'f4')

def normals(h, k, W):
    gy, gx = np.gradient(h); gx *= W; gy *= W; nx, ny = -gx * k, -gy * k
    l = np.sqrt(nx * nx + ny * ny + 1); return nx / l, ny / l, 1 / l

def light(n, lx):
    L = np.array([lx, -.55, .8], 'f4'); L /= np.linalg.norm(L)
    Hh = L + np.array([0, 0, 1], 'f4'); Hh /= np.linalg.norm(Hh)
    d = np.clip(n[0] * L[0] + n[1] * L[1] + n[2] * L[2], 0, 1)
    s = np.clip(n[0] * Hh[0] + n[1] * Hh[1] + n[2] * Hh[2], 0, 1)
    return d, s

def enc_webp(rgba, q=90):
    b = io.BytesIO(); Image.fromarray(rgba, 'RGBA').save(b, 'WEBP', quality=q, method=6, alpha_quality=100)
    return 'data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode()

# ════════════════════════════════════════════════════════════════════════════
# 4 · MATERIAL SHADERS
# ════════════════════════════════════════════════════════════════════════════
def shade_metal(g, finish, polish, d, s, st, ny):
    hi, lo = [hexc(c) for c in METALS[finish]]
    mirror = polish == 'mirror'
    b = g.band(.95 + st * .55, .13 if mirror else .2)
    t = np.clip(.5 + ny * 1.6, 0, 1)[..., None]
    base = lo * (1 - t) + hi * t
    spec = (s ** (34 if mirror else 16))[..., None] * (.95 if mirror else .55) * (.55 + .45 * hi)
    return base * (.42 + .85 * d[..., None] + .55 * b[..., None]) + spec + (b ** 3 * (.3 if mirror else .18))[..., None]

def shade_enamel(g, col, d, s, st, eng):
    warm = np.clip(col * 2.2 + .15, 0, 1)
    c = col * (.62 + .4 * d[..., None]) * (.9 + .1 * eng[..., None])
    return c + (g.band(.95 + st * .55, .2) * .07)[..., None] * warm + (s ** 90)[..., None] * .15

def holo_field(g, rng):
    from scipy.ndimage import zoom
    def blob(div):
        a = rng.standard_normal((g.HP // div + 2, g.W // div + 2)).astype('f4')
        z = zoom(a, (g.HP / (a.shape[0] - 1), g.W / (a.shape[1] - 1)), order=3)[:g.HP, :g.W]
        return (z - z.mean()) / z.std()
    grain = G(rng.standard_normal((g.HP, g.W)).astype('f4'), .7); grain /= grain.std()
    return dict(field=blob(150) + .18 * blob(45), grain=grain)

def shade_holo(g, finish, d, s, st, n, F):
    H_ = HOLO[finish]
    t = F['field'] * H_['spread'] + st * .12 + n[0] * 1.2 - n[1] * .6 + g.X * .35 + g.Y * .2
    pal = .5 + .44 * np.cos(6.2832 * (t[..., None] + np.array([0, .33, .67], 'f4')))
    if H_['tint']:
        pal = pal * (1 - H_['tint_amt']) + (pal * .35 + hexc(H_['tint']) * .75) * H_['tint_amt']
    glit = np.clip(np.roll(F['grain'], int(st * 3), 1) - 2.3, 0, 1) * H_['grain'] * 2.5
    c = pal * (.42 + .5 * d[..., None]) + (s ** 30)[..., None] * .45
    return c + (g.band(.95 + st * .55, .18) * .22)[..., None] + glit[..., None]

def env_band(g, n, c, w, k=.35):
    v = g.X * .927 + g.Y * .375 + n[0] * k + n[1] * k * .4
    return np.exp(-((v - c) / w) ** 2)

def shade_mirror(g, finish, d, s, st, n):
    tint = hexc(MIRRORS[finish])
    env = (.26 + .1 * (1 - g.Y / g.H) + .85 * env_band(g, n, .95 + st * .55, .06) + .5 * env_band(g, n, .52 + st * .5, .035)
           + .3 * env_band(g, n, 1.42 + st * .45, .12) + .12 * (1 - np.clip(g.Y / g.H, 0, 1)))
    return tint * env[..., None] + (s ** 120)[..., None]

def shade_glass(g, finish, d, s, st, n, cd):
    G_ = GLASS[finish]; tint = hexc(G_['tint'])
    refl = .5 * env_band(g, n, .95 + st * .55, .07, .6) + .25 * env_band(g, n, 1.4 + st * .5, .04, .6)
    edge = ss(-.012, 0, cd)
    a = np.clip(G_['alpha'] + refl * .9 + (s ** 60) * .8 + edge * .55, 0, 1)
    col = tint * .55 + (refl + (s ** 60) + edge * .5)[..., None]
    return np.clip(col, 0, 1.4), a

def shade_frost(g, d, s, st):
    col = np.array([.93, .95, .97], 'f4') * (.62 + .38 * d[..., None]) + (g.band(.95 + st * .55, .25) * .12)[..., None]
    return col, np.full(d.shape, .62, 'f4')

def shade_crystal(g, d, s, st, n, F):
    fire = .5 + .5 * np.cos(6.2832 * ((n[0] * 2.2 + n[1] * 1.4 + st * .3)[..., None] + np.array([0, .33, .67], 'f4')))
    glint = np.clip(np.roll(F['grain'], int(st * 4), 1) - 1.5, 0, 1) * 2.2
    base = (.55 + .45 * d)[..., None] * np.array([.9, .94, 1], 'f4') * .85
    return base + fire * .22 + (s ** 25)[..., None] * 1.2 + glint[..., None]

def shade_stock(g, stock, d, s, st, streak):
    hi, lo = [hexc(c) for c in STOCKS[stock]]
    base = lo * .5 + hi * .5
    c = base * (.5 + .6 * d[..., None]) * (.9 + .2 * streak[..., None])
    return c + (s ** 20)[..., None] * .4 + (g.band(.95 + st * .55, .2) * .2)[..., None]

# ════════════════════════════════════════════════════════════════════════════
# 5 · PHOTO PRINT + FILTER CHAIN
# ════════════════════════════════════════════════════════════════════════════
def soft_light(b, s):
    D = np.where(b <= .25, ((16 * b - 12) * b + 4) * b, np.sqrt(b))
    return np.where(s <= .5, b - (1 - 2 * s) * b * (1 - b), b + (2 * s - 1) * (D - b))

SEG = {'0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc',
       '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': ''}

def seg_lines(text, x, y, h, gap=.28):
    """Seven-segment glyph strokes, top-left at (x, y). Returns list of ((x0,y0),(x1,y1))."""
    w = h * .5; out = []; cx = x
    for ch in text:
        if ch == "'":
            out.append(((cx + w * .15, y), (cx + w * .05, y + h * .18))); cx += w * .45; continue
        P = {'a': ((0, 0), (1, 0)), 'b': ((1, 0), (1, .5)), 'c': ((1, .5), (1, 1)), 'd': ((0, 1), (1, 1)),
             'e': ((0, .5), (0, 1)), 'f': ((0, 0), (0, .5)), 'g': ((0, .5), (1, .5))}
        for sgm in SEG.get(ch, ''):
            (u0, v0), (u1, v1) = P[sgm]; k = .14
            ax, ay = u0 + (u1 - u0) * k, v0 + (v1 - v0) * k; bx, by = u1 - (u1 - u0) * k, v1 - (v1 - v0) * k
            sk = lambda u, v: (cx + u * w - v * h * .12 + h * .06, y + v * h)          # slight italic, like LED stamps
            out.append((sk(ax, ay), sk(bx, by)))
        cx += w * (1 + gap)
    return out, cx - x

def datestamp(p, f):
    """90s camera date imprint: orange seven-segment LED digits burned into the film, with bloom."""
    from PIL import ImageDraw
    th, tw = p.shape[:2]; h = f.get('size', .045) * tw
    lines, width = seg_lines(f['text'], 0, 0, h)
    x0 = tw * f.get('pos', [.9, .93])[0] - width; y0 = th * f.get('pos', [.9, .93])[1] - h
    lay = Image.new('L', (tw, th), 0); dr = ImageDraw.Draw(lay)
    for (a, b) in lines:
        dr.line([(a[0] + x0, a[1] + y0), (b[0] + x0, b[1] + y0)], fill=255, width=max(2, int(h * .14)))
    m = np.asarray(lay).astype('f4') / 255
    col = hexc(f.get('color', '#ff8a1e'))
    glow = np.clip(G(m, h * .18) * 1.6 + G(m, h * .6) * .7, 0, 1)
    halo = glow[..., None] * .55
    p = p * (1 - halo) + (p * col) * halo + glow[..., None] * col * .25          # warm bloom, keeps contrast on whites
    core = np.clip(col * 1.08 + np.array([.04, .02, 0], 'f4'), 0, 1)
    return np.clip(p * (1 - m[..., None]) + core * m[..., None], 0, 1)

def build_photo(M, img, zone, base_dir, rng, W):
    x, y, w, h = zone['rect']
    tw, th = int(w / W * 1200), int(h / W * 1200)
    ph = Image.open(os.path.join(base_dir, img['src'])).convert('RGB')
    sc = max(tw / ph.width, th / ph.height) * img.get('zoom', 1)
    ph = ph.resize((int(ph.width * sc + 1), int(ph.height * sc + 1)), Image.LANCZOS)
    fx, fy = img.get('focus', [.5, .5])
    ox, oy = int((ph.width - tw) * fx), int((ph.height - th) * fy)
    p = np.asarray(ph.crop((ox, oy, ox + tw, oy + th))).astype('f4') / 255
    yy = np.linspace(0, 1, th)[:, None, None]; xx = np.linspace(0, 1, tw)[None, :, None]
    for f in img.get('filters', []):
        k = f['kind']
        if k == 'grade':
            pre = f['preset']
            if pre.startswith('filter.'): pre = M['tokens']['filter'][pre[7:]]
            gp = GRADES[pre]; st = f.get('strength', 1.0)
            sep = np.stack([p @ np.array([.393, .769, .189]), p @ np.array([.349, .686, .168]),
                            p @ np.array([.272, .534, .131])], -1)
            p = p * (1 - gp['sepia'] * st) + np.clip(sep, 0, 1) * gp['sepia'] * st
            lum = (p @ np.array([.2126, .7152, .0722], 'f4'))[..., None]
            p = lum + (p - lum) * gp['sat']
            p = np.clip(((p - .5) * gp['contrast'] + .5) * gp['gain'], 0, 1)
            if gp['top']:
                gr = np.clip(1 - yy * 1.1 - xx * .2 + .15, 0, 1)
                wash = hexc(gp['top']) * gr + hexc(gp['bottom']) * (1 - gr)
                p = p * (1 - gp['wash'] * st) + soft_light(p, wash) * gp['wash'] * st
        elif k == 'split-tone':
            L = (p @ np.array([.2126, .7152, .0722], 'f4'))[..., None]; a_ = f.get('amount', .25)
            p = p + (hexc(f['shadows']) - .5) * a_ * (1 - L) ** 1.5 + (hexc(f['highlights']) - .5) * a_ * L ** 1.5
        elif k == 'fade':
            p = p * (1 - f.get('amount', .08)) + hexc(f.get('color', '#202428')) * f.get('amount', .08)
        elif k == 'halation':
            L = p @ np.array([.2126, .7152, .0722], 'f4'); thr = f.get('threshold', .78)
            b = np.clip((L - thr) / (1 - thr), 0, 1); r = f.get('radius', 14) * tw / 1000
            glow = G(b, r)[..., None] * hexc(f.get('color', '#ff5a2a')) * f.get('amount', .5)
            p = 1 - (1 - p) * (1 - np.clip(glow, 0, 1))
        elif k == 'halftone':
            cell = f.get('cell', 7) * tw / 1000; an = np.deg2rad(f.get('angle', 45))
            Xh, Yh = np.meshgrid(np.arange(tw, dtype='f4'), np.arange(th, dtype='f4'))
            u = (Xh * np.cos(an) + Yh * np.sin(an)) / cell; v = (-Xh * np.sin(an) + Yh * np.cos(an)) / cell
            dist = np.hypot(u - np.floor(u) - .5, v - np.floor(v) - .5)
            L = p @ np.array([.2126, .7152, .0722], 'f4'); r = np.sqrt(np.clip(1 - L, 0, 1)) * .62
            dot = np.clip((r - dist) / .06 + .5, 0, 1); amt = f.get('amount', .4)
            p = p * (1 - amt * dot[..., None] * .9)
        elif k == 'datestamp':
            p = datestamp(p, f)
        elif k == 'vignette':
            r = np.sqrt(((xx - .5) / .62) ** 2 + ((yy - .42) / .7) ** 2)
            p = p * (1 - f.get('amount', .55) * np.clip(r - .55, 0, 1) ** 1.4)
        elif k == 'grain':
            gr = G(rng.standard_normal((th, tw)).astype('f4'), f.get('size', .55)); gr /= gr.std()
            p = np.clip(p + gr[..., None] * f.get('amount', .028), 0, 1)
            if f.get('chroma'):
                cg = G(rng.standard_normal((th, tw, 3)).astype('f4'), (f.get('size', .55) * 1.6,) * 2 + (0,))
                p = np.clip(p + cg / cg.std() * f['chroma'], 0, 1)
    return np.clip(p, 0, 1)

# ════════════════════════════════════════════════════════════════════════════
# 6 · PRODUCTION RUN · ops → height map + material layers → 3 lit images
# ════════════════════════════════════════════════════════════════════════════
def tok(M, ref):
    """'enamel.field' → tokens.enamel.field ; dicts pass through."""
    return get_path(M['tokens'], ref) if isinstance(ref, str) else ref

def zone_mask(g, z):
    W = g.W
    if 'rect' in z:
        x, y, w, h = [v / W for v in z['rect']]
        sd = g.rr(x + w / 2, y + h / 2, w / 2, h / 2, z.get('r', 0) / W)
        if z.get('arch'):                                     # arched top: ellipse ∪ lower rectangle
            ar = z['arch'] / W; cxz = x + w / 2
            el = (np.hypot((g.X - cxz) / (w / 2), (g.Y - (y + ar)) / ar) - 1) * min(w / 2, ar)
            rb = g.rr(cxz, (y + ar - .02 + y + h) / 2, w / 2, (h - ar + .02) / 2, z.get('r', 0) / W)
            sd = np.minimum(el, rb)
        ch = z.get('chamfer', {}); x1, y1 = x + w, y + h; r2 = 2 ** -.5
        if 'tr' in ch: c = ch['tr'] / W; sd = np.maximum(sd, ((g.X - (x1 - c)) - (g.Y - y)) * r2)
        if 'bl' in ch: c = ch['bl'] / W; sd = np.maximum(sd, ((g.Y - (y1 - c)) - (g.X - x)) * r2)
        if 'tl' in ch: c = ch['tl'] / W; sd = np.maximum(sd, ((x + c - g.X) - (g.Y - y)) * r2)
        if 'br' in ch: c = ch['br'] / W; sd = np.maximum(sd, ((g.X - (x1 - c)) - (y1 - g.Y)) * r2)
    else:
        cx, cy = z['center'][0] / W, z['center'][1] / W; rx, ry = z['rx'] / W, z['ry'] / W
        sd = (np.hypot((g.X - cx) / rx, (g.Y - cy) / ry) - 1) * min(rx, ry)
    return 1 - ss(-.0006, .0006, sd), sd

def run_side(M, side, g, masks, rng, base_dir, prod_dir):
    Z = M['zones']; cardm, cd = zone_mask(g, Z['card'])
    def mask_of(spec, place):
        items = spec if isinstance(spec, list) else [spec]
        cur = np.zeros_like(cardm)
        for it in items:
            neg = it.startswith('-'); inter = it.startswith('&'); name = it.lstrip('-&')
            mod = re.match(r'(grow|halo)\(([\w@-]+),\s*([\d.]+)\)', name)
            if mod:
                from scipy.ndimage import maximum_filter
                base = mask_of(mod.group(2), place) / np.maximum(cardm, 1e-6) * (cardm > 0)
                r = int(float(mod.group(3)))
                yy, xx = np.mgrid[-r:r + 1, -r:r + 1]
                gm = G(maximum_filter(base, footprint=(xx * xx + yy * yy) <= r * r), .5)
                m = gm if mod.group(1) == 'grow' else np.clip(gm - base, 0, 1)
                cur = np.minimum(cur, 1 - m) if neg else (cur * m if inter else np.maximum(cur, m))
                continue
            key = f'{name}@{place[name]}' if name in place else name
            if name in ('card', 'full'): m = cardm
            elif key in masks: m = masks[key]          # components win over zones
            elif name in Z: m = zone_mask(g, Z[name])[0]
            else: sys.exit(f'unknown mask: {name}')
            cur = np.minimum(cur, 1 - m) if neg else (cur * m if inter else np.maximum(cur, m))
        return cur * cardm
    h = np.zeros_like(cardm); raised = np.zeros_like(cardm); win = np.zeros_like(cardm)
    layers, plates, photo, eng_depth, brush = [], [], None, 0, 35
    for i, op in enumerate(M['sides'][side]['ops']):
        kind = op['op']; P = op.get('params', {}); place = op.get('place', {})
        m = mask_of(op.get('mask', 'card'), place)
        label = kind
        if kind == 'brush':
            brush = P.get('angle_deg', 35); layers.append(('stock', m, M['blank']['stock']))
            label = f"brush-{M['blank']['stock']}"
        elif kind == 'engrave':
            eng_depth = P.get('depth_mm', .12); h -= ENG_PER_MM * eng_depth * G(m, .9)
            label = f"engrave-{eng_depth}mm"
        elif kind == 'enamel':
            col = tok(M, op['color']); h += ENG_PER_MM * eng_depth * .8 * G(m, .9)
            layers.append(('enamel', m, (hexc(col['hex']), col.get('process')))); label = f"enamel-{col.get('name', col['hex'])}"
        elif kind == 'emboss':
            mm = P.get('height_mm', .08); h += EMB_PER_MM * mm * G(m, P.get('soft', .9)); raised = np.maximum(raised, m)
            label = f"emboss-{mm}mm"
        elif kind == 'etch':                      # acid/sandblast frosting (glass) or matte etch (metal)
            layers.append(('frost', m, None)); label = 'etch-frost'
        elif kind == 'deboss':
            mm = P.get('height_mm', .04); h -= EMB_PER_MM * mm * G(m, .9)
            label = f"deboss-{mm}mm"
        elif kind in ('plate', 'foil'):
            mt = tok(M, op['metal'])
            if kind == 'foil' and P.get('emboss', .5) > 0:
                h += P.get('emboss', .5) * 1.4 * G(m, 1.1); raised = np.maximum(raised, m)
            layers.append(('metal', m, mt)); label = f"{kind}-{mt['finish']}-{mt.get('polish', 'mirror')}"
        elif kind == 'print':
            if op.get('knockout', not op.get('bake')):   # printer leaves raised metal unprinted
                m = m * (1 - np.clip(G(raised, .6) * 1.3, 0, 1))
            img = op['image']; zone = Z[img.get('zone', 'window')]
            if op.get('bake'):                      # secondary print, baked into the face (thumbnails, inserts)
                ph2 = build_photo(M, img, zone, base_dir, rng, g.W); x_, y_, w_, h_ = zone['rect']
                arr = np.zeros((g.HP, g.W, 3), 'f4')
                arr[y_:y_ + h_, x_:x_ + w_] = np.asarray(Image.fromarray(u8(ph2)).resize((w_, h_), Image.LANCZOS)).astype('f4') / 255
                layers.append(('image', m, arr)); label = 'print-baked'
                Image.fromarray(u8(m)).save(os.path.join(prod_dir, f'{side}-{i:02d}-{label}.png'))
                plates.append(dict(step=i, op=kind, plate=f'{side}-{i:02d}-{label}.png')); continue
            photo = build_photo(M, img, zone, base_dir, rng, g.W); win = m
            layers.append(('print', m, None)); label = 'print-cmyk+white-underbase'
            Image.fromarray(u8(photo)).save(os.path.join(prod_dir, f'{side}-{i:02d}-print-photo.jpg'), quality=95)
        else:
            sys.exit(f'unknown op: {kind}')
        Image.fromarray(u8(m)).save(os.path.join(prod_dir, f'{side}-{i:02d}-{label}.png'))
        plates.append(dict(step=i, op=kind, plate=f'{side}-{i:02d}-{label}.png', **{k: v for k, v in op.items() if k not in ('op', 'mask', 'image')}))

    # surface texture from the brush op (engine-turned line + brushed streaks)
    a = np.deg2rad(brush + 90)
    eng = .5 + .5 * np.cos((g.X * np.cos(a) + g.Y * np.sin(a)) * g.W * .51)
    v = (-g.X * np.sin(np.deg2rad(brush)) + g.Y * np.cos(np.deg2rad(brush))) * g.W
    line = G(rng.standard_normal(int(g.W * 2.2) + 8).astype('f4'), 1.2); line /= line.std()
    streak = .5 + .25 * np.interp(v, np.arange(len(line)) - g.W * .4, line)

    n = normals(G(h, .7), .0062, g.W)
    F = holo_field(g, rng)
    shadow = G(np.roll(np.roll(raised, 5, 0), 4, 1), 3)
    edge = G(1 - win, 9) * win if photo is not None else np.zeros_like(win)
    bench = hexc(M['render'].get('bench', '#120a0a'))
    shcol = np.array([.08, 0, .01], 'f4')
    out = []
    for st in M['render'].get('lights', [-1, 0, 1]):
        d, s = light(n, st * .7)
        Pm = np.zeros(cardm.shape + (3,), 'f4'); cov = np.zeros_like(cardm)   # premultiplied
        for kind, m, mat in layers:
            if kind == 'print': cov = cov * (1 - m); Pm = Pm * (1 - m[..., None]); continue
            a = None; fin = mat if kind == 'stock' else (mat or {}).get('finish') if kind == 'metal' else None
            if kind == 'image': col = mat * (1 - .06 * st) + (g.band(.95 + st * .55, .2) * .05)[..., None]
            elif kind == 'frost': col, a = shade_frost(g, d, s, st)
            elif fin in GLASS: col, a = shade_glass(g, fin, d, s, st, n, cd)
            elif fin in MIRRORS: col = shade_mirror(g, fin, d, s, st, n)
            elif fin == 'crystal': col = shade_crystal(g, d, s, st, n, F)
            elif kind == 'stock': col = shade_stock(g, mat, d, s, st, streak)
            elif kind == 'enamel':
                col = shade_enamel(g, mat[0], d, s, st, eng)
                if mat[1] == 'glow-enamel':                        # photoluminescent: reads lit even off-axis
                    col = mat[0] * (.88 + .18 * d[..., None]) + (s ** 40)[..., None] * .25
            elif fin in HOLO: col = shade_holo(g, fin, d, s, st, n, F)
            else: col = shade_metal(g, fin, mat.get('polish', 'mirror'), d, s, st, -n[1])
            if kind not in ('metal', 'image'): col = col * (1 - .55 * shadow * (1 - raised))[..., None]
            ma = m if a is None else m * a
            Pm = Pm * (1 - ma[..., None]) + col * ma[..., None]; cov = cov * (1 - ma) + ma
        Pm = Pm * (1 - ss(-.003, 0, cd)[..., None] * .75)          # card edge chamfer
        Sw = np.clip(shadow * .7 + edge * .45, 0, 1) * (1 - cov) * win
        gl = g.band(.95 + st * .55, .2) * win * (1 - cov) * .08     # glass sheen on the print
        P_ = Pm + shcol * Sw[..., None] + gl[..., None]
        A_ = np.clip(cov + Sw + gl, 0, 1)
        rgb = P_ / np.maximum(A_, 1e-4)[..., None]
        out.append(np.dstack([u8(rgb), u8(A_ * cardm)]))
    return out, photo, plates

# ════════════════════════════════════════════════════════════════════════════
# 7 · CARD SHELL (tilt + flip, cross-fades the 3 baked lights · from card6.src.html)
# ════════════════════════════════════════════════════════════════════════════
TEMPLATE = r"""<title>__title__</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
:root{--bg:__bench__;--mute:#a08772;--focus:#ffc925;--ui:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color-scheme:dark}
*{box-sizing:border-box}html,body{height:100%}
body{margin:0;background:var(--bg);font-family:var(--ui);overflow-x:hidden}
.page{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding-block:16px 20px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.stage{position:relative;width:min(calc(100vw - 24px),430px,calc((100svh - 80px) / 1.545));aspect-ratio:__W__/__H__;max-width:100%;perspective:1200px;touch-action:none;-webkit-user-select:none;user-select:none;cursor:grab;-webkit-tap-highlight-color:transparent}
.stage:focus-visible{outline:2px solid var(--focus);outline-offset:6px;border-radius:6%/3.9%}
.card{position:absolute;inset:0;will-change:transform}
.shadow{position:absolute;left:9%;right:9%;bottom:-2.5%;height:4%;background:radial-gradient(closest-side,rgba(0,0,0,.8),transparent);filter:blur(8px)}
.face{position:absolute;inset:0}.face[hidden]{display:none}.back{transform:scaleX(-1)}
.face img{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;-webkit-user-drag:none}
.ph{position:absolute;__ph__;overflow:hidden;background:#222}
.ph img{position:absolute;inset:0;width:100%;height:100%;display:block}
.face .l,.face .r{opacity:0;will-change:opacity}
.hint{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--mute);text-align:center}
</style>
<div class="page">
  <div class="stage" id="stage" tabindex="0" role="button" aria-label="__label__. Drag to tilt, tap or press Enter to flip.">
    <div class="shadow"></div>
    <div class="card" id="card">
      <div class="face front" id="front">__phdiv__<img src="__front1__" alt="__altf__"><img class="l" src="__front0__" alt=""><img class="r" src="__front2__" alt=""></div>
      <div class="face back" id="back" hidden><img src="__back1__" alt="__altb__"><img class="l" src="__back0__" alt=""><img class="r" src="__back2__" alt=""></div>
    </div>
  </div>
  <div class="hint">Drag to tilt · Tap to flip</div>
</div>
<script>
(()=>{
const stage=document.getElementById('stage'),card=document.getElementById('card'),F=document.getElementById('front'),B=document.getElementById('back');
const L=[F.querySelector('.l'),B.querySelector('.l')],R=[F.querySelector('.r'),B.querySelector('.r')];
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
let target={x:0,y:0},tilt={x:0,y:0},vel={x:0,y:0},dragging=false,lastMove=-1e9,flip=0,flipT=0,fv=0,down=null,side=0,running=false,last=0;
function tiltFrom(e){const r=stage.getBoundingClientRect();target.x=Math.max(-1,Math.min(1,(((e.clientX-r.left)/r.width)*2-1)*1.1));target.y=Math.max(-1,Math.min(1,-(((e.clientY-r.top)/r.height)*2-1)*1.1));lastMove=performance.now();wake();}
stage.addEventListener('pointerdown',e=>{dragging=true;stage.setPointerCapture(e.pointerId);down={x:e.clientX,y:e.clientY,t:performance.now()};tiltFrom(e);});
stage.addEventListener('pointermove',e=>{if(dragging||e.pointerType==='mouse')tiltFrom(e);});
stage.addEventListener('pointerup',e=>{if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<8&&performance.now()-down.t<350)flipT=flipT?0:1;down=null;dragging=false;target.x=0;target.y=0;wake();});
stage.addEventListener('pointercancel',()=>{dragging=false;target.x=0;target.y=0;wake();});
stage.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'){dragging=false;target.x=0;target.y=0;wake();}});
stage.addEventListener('keydown',e=>{const k={ArrowLeft:[-.7,0],ArrowRight:[.7,0],ArrowUp:[0,.7],ArrowDown:[0,-.7]}[e.key];if(k){target.x=k[0];target.y=k[1];lastMove=performance.now();e.preventDefault();wake();}
  if(e.key==='Enter'||e.key===' '){flipT=flipT?0:1;e.preventDefault();wake();}});
function wake(){if(!running){running=true;last=performance.now();requestAnimationFrame(frame);}}
function frame(now){
  const dt=Math.min(.05,(now-last)/1000);last=now;const t=now/1000;
  let tx=target.x,ty=target.y;const idle=!dragging&&!reduce&&now-lastMove>1500;
  if(idle){tx=Math.sin(t*.6)*.4;ty=Math.sin(t*.45+1)*.26;}
  const k=dragging?80:36,dd=dragging?13:8;
  vel.x+=((tx-tilt.x)*k-vel.x*dd)*dt;vel.y+=((ty-tilt.y)*k-vel.y*dd)*dt;tilt.x+=vel.x*dt;tilt.y+=vel.y*dt;
  if(reduce)flip=flipT;else{fv+=((flipT-flip)*70-fv*12)*dt;flip+=fv*dt;}
  const b=flip>.5?1:0;if(b!==side){side=b;F.hidden=!!b;B.hidden=!b;}
  card.style.transform=`rotateY(${(tilt.x*14+flip*180).toFixed(2)}deg) rotateX(${(tilt.y*10).toFixed(2)}deg)`;
  const s=Math.max(-1,Math.min(1,((b?-tilt.x:tilt.x)*1.1-tilt.y*.35)));
  L[b].style.opacity=Math.max(0,-s).toFixed(3);R[b].style.opacity=Math.max(0,s).toFixed(3);
  const moving=idle||dragging||Math.abs(vel.x)+Math.abs(vel.y)+Math.abs(fv)>.001||Math.abs(tx-tilt.x)+Math.abs(ty-tilt.y)+Math.abs(flipT-flip)>.001;
  if(moving)requestAnimationFrame(frame);else running=false;
}
wake();
})();
</script>
"""

# ════════════════════════════════════════════════════════════════════════════
# 8 · BUILD
# ════════════════════════════════════════════════════════════════════════════
def collect_jobs(M):
    C, Z = M['components'], M['zones']; jobs = {}
    for side in M['sides'].values():
        for op in side['ops']:
            place = op.get('place', {}); spec = op.get('mask', [])
            for it in (spec if isinstance(spec, list) else [spec]):
                mod = re.match(r'(?:grow|halo)\(([\w@-]+),', it.lstrip('-&'))
                name = mod.group(1) if mod else it.lstrip('-&'); base = name
                if base not in C and base.rsplit('-', 1)[0] in C: base = base.rsplit('-', 1)[0]
                if base not in C: continue
                comp = C[base]; zref = place.get(base) or comp.get('place', {}).get('at') or comp.get('place', {}).get('in')
                jname = f'{base}@{place[base]}' if base in place else base
                j = dict(comp, name=jname, params=comp.get('params', {}))
                if zref in Z: j['zone'] = Z[zref]
                if 'field' in Z: j['field'] = Z['field']
                if 'clip' in comp: j['exclude'] = Z[comp['clip']['exclude']]; j['margin'] = comp['clip'].get('margin', 0)
                if comp['kind'] == 'artwork':
                    if not comp['src'].endswith('.svg'): continue        # raster artwork handled in python
                    j['svg'] = open(os.path.join(M['_dir'], comp['src'])).read()
                jobs[jname] = j
    return list(jobs.values())

def build(args):
    M = load(args.manifest, args.patch, args.set)
    M = dict(M, components=deep_fill(M['components'], M), sides=deep_fill(M['sides'], M))
    base_dir = os.path.dirname(os.path.abspath(args.manifest)); M['_dir'] = base_dir
    slug = M['id'].replace('/', '__')
    out = os.path.join(args.out, slug); prod = os.path.join(out, 'production')
    os.makedirs(prod, exist_ok=True)
    yaml.safe_dump(M, open(os.path.join(out, 'resolved.card.yaml'), 'w'), sort_keys=False, allow_unicode=True)
    W, HP = M['blank']['grid']; g = Grid(W, HP)
    rng = np.random.default_rng(M.get('seed', 0))

    with tempfile.TemporaryDirectory() as td:
        print('· masks'); render_masks(M, collect_jobs(M), td)
        masks = {f[:-4]: np.asarray(Image.open(os.path.join(td, f)))[..., 3].astype('f4') / 255
                 for f in os.listdir(td) if f.endswith('.png')}
        if args.keep_masks:
            os.makedirs(os.path.join(out, 'masks'), exist_ok=True)
            for k, v in masks.items(): Image.fromarray(u8(v)).save(os.path.join(out, 'masks', f'{k}.png'))
    for name, comp in M['components'].items():       # raster artwork: dark ink on light paper → mask
        if comp['kind'] == 'artwork' and not comp['src'].endswith('.svg'):
            for sub, path in comp['layers'].items():
                im = Image.open(os.path.join(base_dir, path)).convert('LA').resize((W, HP), Image.LANCZOS)
                a = np.asarray(im).astype('f4') / 255
                masks[name if sub == 'fill' else f'{name}-{sub}'] = (1 - a[..., 0]) * a[..., 1]
    A, plates = {}, {}
    for side in M['sides']:
        print(f'· {side}: ops + light')
        imgs, photo, plates[side] = run_side(M, side, g, masks, rng, base_dir, prod)
        for i, im in enumerate(imgs):
            A[f'{side}{i}'] = enc_webp(im)
            if i == 1:  # flat preview (photo under the centre-lit face)
                bg = Image.new('RGBA', (W, HP), M['render'].get('bench', '#120a0a'))
                if photo is not None:
                    x, y, w, h = M['zones']['window']['rect']
                    bg.paste(Image.fromarray(u8(photo)).resize((w, h), Image.LANCZOS), (x, y))
                bg.alpha_composite(Image.fromarray(im, 'RGBA'))
                bg.convert('RGB').save(os.path.join(out, f'preview-{side}.png'))
        if photo is not None:
            b = io.BytesIO(); Image.fromarray(u8(photo)).save(b, 'JPEG', quality=90, optimize=True, subsampling=0)
            A['photo'] = 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()

    json.dump(dict(id=M['id'], blank=M['blank'], edition=M['edition'], sides=plates,
                   note='Plates are at design-grid resolution; white = apply operation.'),
              open(os.path.join(prod, 'production.json'), 'w'), indent=2)

    x, y, w, h = M['zones']['window']['rect']; r = M['zones']['window'].get('r', 0)
    ph = (f'left:{x / W * 100:.3f}%;top:{y / HP * 100:.3f}%;width:{w / W * 100:.3f}%;height:{h / HP * 100:.3f}%;'
          f'border-radius:{r / w * 100:.2f}%/{r / h * 100:.2f}%')
    e = M['edition']; name = M.get('creator', {}).get('name') or M.get('card', {}).get('title') or M['id']
    label = f"Signed fan card, {name}, edition {e['no']:03d} of {e['of']}"
    html = TEMPLATE
    for k, v in {'__title__': f"{name} Fancard", '__bench__': M['render'].get('bench', '#120a0a'),
                 '__W__': str(W), '__H__': str(HP), '__ph__': ph, '__label__': label,
                 '__phdiv__': '<div class="ph"><img src="__photo__" alt=""></div>' if 'photo' in A else '',
                 '__altf__': f'Front: {name}, signed', '__altb__': f"Back: edition {e['no']:03d} of {e['of']}, signed"}.items():
        html = html.replace(k, v)
    for k, v in A.items(): html = html.replace(f'__{k}__', v)
    path = os.path.join(out, 'card.html'); open(path, 'w').write(html)
    print(f'✓ {path}  ({len(html) / 1048576:.1f} MB)')

if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='Fancard Studio: build a card from a manifest.')
    ap.add_argument('manifest')
    ap.add_argument('--patch', action='append', default=[], help='variant patch (repeatable, applied in order)')
    ap.add_argument('--set', action='append', default=[], help='override: dotted.path=value (repeatable)')
    ap.add_argument('--out', default=os.path.join(HERE, 'out'))
    ap.add_argument('--keep-masks', action='store_true', help='also save raw component masks to out/<id>/masks/')
    build(ap.parse_args())
