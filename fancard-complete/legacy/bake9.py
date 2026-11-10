import numpy as np,io,base64
from PIL import Image
from scipy.ndimage import gaussian_filter as G
src=open('bake8.py').read()
exec(src.split("MAG=hexc")[0])
MAG=hexc('#ff2bd6');BLU=hexc('#3d5bff');INK=hexc('#0d0c12')
nm=np.clip(X*.75+Y/H*.35-.05,0,1)[...,None];NEON=MAG*(1-nm)+BLU*nm
def U(a,b):return np.minimum(a,b)
# ---- frame silhouette: the photo window with machined steps and tabs biting in ----
cd=np.maximum(rr(.5,H/2,.49,H/2-.01,.012),chamf(.5,H/2,.49,H/2-.01,.06))
cardm=1-ss(-.0009,.0009,cd)
wy0,wy1=.06,H-.15;wcx,wcy,whx,why=.5,(wy0+wy1)/2,.44,(wy1-wy0)/2
base=np.maximum(rr(wcx,wcy,whx,why,.006),chamf(wcx,wcy,whx,why,.045))
def blk(cx,cy,hx,hy,c=.018):return np.maximum(rr(cx,cy,hx,hy,.004),chamf(cx,cy,hx,hy,c))
add=U(U(U(blk(.5,.07,.17,.05),blk(.06,.56,.035,.13,.02)),U(blk(.94,.98,.035,.11,.02),blk(.8,H-.2,.12,.065,.025))),blk(.19,H-.175,.12,.035,.02))
wd=np.maximum(base,-add)
win=1-ss(-.0006,.0006,wd)
grv=m('f_grv');slot=m('f_slot');txt=m('f_txt')
# ---- polished black chrome ----
def chromeK(n,st,dark=1.):
    t=n[1]*2.2+n[0]*1.1-st*.75+(Y/H-.5)*.9+(X-.5)*.35
    g=lambda c,s:np.exp(-(t-c)**2/(2*s*s))
    env=.015+1.5*g(.3,.055)+.55*g(-.55,.09)+.85*g(1.15,.07)+.25*g(-1.3,.2)
    side=np.clip(.5-n[0]*3,0,1)[...,None]
    refl=MAG*side+BLU*(1-side)
    c=INK*dark+env[...,None]*(np.array([.86,.86,.92],'f4')*.72+refl*.28)
    return c+(band(.95+st*.55,.06)*.22)[...,None]
def bright(n,st):
    t=n[1]*2.2+n[0]*1.1-st*.75+(Y/H-.5)*.9
    env=.45+.55*np.exp(-(t-.3)**2/(2*.25**2))
    return env[...,None]*np.array([.95,.93,1.],'f4')
STATES=(-1.,0.,1.);A={}
ph=Image.open('/mnt/user-data/attachments/d5c528f3-de72-5ee3-8398-0c88cf384ece/715490db-image.jpg').convert('RGB')
bw,bh=2*whx,2*why;tw,th=int(bw*1250),int(bh*1250)
sc=max(tw/ph.width,th/ph.height);ph=ph.resize((int(ph.width*sc+1),int(ph.height*sc+1)),Image.LANCZOS)
ox=int((ph.width-tw)*.5);oy=int((ph.height-th)*.2);ph=ph.crop((ox,oy,ox+tw,oy+th))
b0=io.BytesIO();ph.save(b0,'JPEG',quality=90,optimize=True,subsampling=0)
A['photo']='data:image/jpeg;base64,'+base64.b64encode(b0.getvalue()).decode()
def face(wd,win,grv,slot,txt,extra=None):
    h=ss(0,.005,wd)*ss(0,.006,-cd)-grv*.12-slot*.4
    if extra is not None:h=h+extra
    hb=G(h,.7);n=normals(hb,.0105);slope=1-n[2]
    cut=ss(.02,.12,slope)*(1-slot)
    nt=normals(G(txt,1.),.006)
    glow=G(slot,5)*1.2+G(grv,3)*.0
    out=[]
    for st in STATES:
        c=chromeK(n,st)
        c=c*(1-cut[...,None])+bright(n,st)*cut[...,None]
        c=c*(1-grv[...,None]*.5)+NEON*(grv*.22)[...,None]
        tc=bright(nt,st)*1.15+NEON*.08;c=c*(1-txt[...,None])+tc*txt[...,None]
        c=c*(1-slot[...,None])+NEON*1.2*slot[...,None]+NEON*np.clip(glow*.25,0,1)[...,None]*(1-slot[...,None])
        rim=ss(-.003,0,cd);c=c*(1-rim[...,None]*.5)
        out.append(c)
    return out
cs=face(wd,win,grv,slot,txt)
edge=(1-ss(.001,.0024,np.abs(wd+.002)))*win
eg=G(edge,5)*1.4
for i,c in enumerate(cs):
    st=STATES[i]
    alpha=1-win
    shd=ss(-.022,0,wd)*win
    a2=np.clip(alpha+shd*.55,0,1)
    rgb=c*alpha[...,None]+np.array([.02,0,.04],'f4')*(a2-alpha)[...,None]
    rgb=rgb*(1-edge[...,None])+NEON*1.2*edge[...,None];a2=np.maximum(a2,edge)
    gw=np.clip(eg*.25*win*(1-a2),0,.35);rgb=rgb+NEON*gw[...,None];a2=np.clip(a2+gw,0,1)
    gloss=band(.95+st*.55,.18)*win*.06;rgb=rgb+gloss[...,None];a2=np.clip(a2+gloss,0,1)
    rgb=rgb/np.maximum(a2,1e-4)[...,None]
    A[f'front{i}']=enc(np.dstack([u8(rgb),u8(a2*cardm)]))
# ---- back ----
bg=m('b_grv');bs=m('b_slot');bt=m('b_txt');cx,cy=.5,.74
d=np.hypot(X-cx,Y-cy)
torusH=np.sqrt(np.clip(1-((d-.205)/.03)**2,0,1))
disc=(d<.172).astype('f4')
inner=np.maximum(rr(.5,H/2,.465,H/2-.035,.01),chamf(.5,H/2,.465,H/2-.035,.05))
bne=(1-ss(.001,.0024,np.abs(inner)))
cs=face(-np.ones_like(X)+ss(-.5,0,-cd)*0+1.0,np.zeros_like(X),bg,bs,bt,extra=torusH*.9-disc*.15+ (1-ss(-.002,.002,inner))*0)
for i,c in enumerate(cs):
    c=c*(1-bne[...,None])+NEON*1.2*bne[...,None]+NEON*np.clip(G(bne,5)*.3,0,1)[...,None]
    A[f'back{i}']=enc(np.dstack([u8(c),u8(cardm)]))
print({k:round(len(v)/1024) for k,v in A.items()})
s=open('card8.src.html').read()
import re
s=re.sub(r"\.ph\{position:absolute;left:[^}]*\}",f".ph{{position:absolute;left:{(.5-whx)*100:.3f}%;top:{wy0/H*100:.3f}%;width:{2*whx*100:.3f}%;height:{(wy1-wy0)/H*100:.3f}%;overflow:hidden;background:#2a0b3a}}",s,count=1)
s=s.replace('alt="Two creators in magenta and blue club light, in a gunmetal harness frame"','alt="Two creators in magenta and blue club light, in a machined black chrome frame"').replace('alt="Back: crossed leather straps and a chrome ring on gunmetal, Alpha number 001"','alt="Back: black chrome with machined circuit lines and a polished ring, Alpha number 001"').replace('Gunmetal and harness hardware.','Polished black chrome, machined.')
for k,v in A.items():s=s.replace(f'__{k}__',v)
open('alpha-card.html','w').write(s);print(round(len(s)/1048576,2),'MB')
