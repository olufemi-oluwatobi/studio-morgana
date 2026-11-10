import numpy as np,io,base64
from PIL import Image
from scipy.ndimage import gaussian_filter as G
exec(open('bake5.py').read().split("STATES=(-1.,0.,1.);A={}")[0])
GOLD=hexc('#f2c14e');GOLD2=hexc('#a8701c');OX=hexc('#5a0f14')
cd=rr(.5,H/2,.49,H/2-.01,.05);cardm=1-ss(-.0009,.0009,cd)
wd=rr(.5,H/2,.44,H/2-.06,.016)
def gold(d,s,st,ny):
    b=band(.95+st*.55,.13)
    t=np.clip(.5+ny*1.6,0,1)[...,None]
    base=GOLD2*(1-t)+GOLD*t
    c=base*(.42+.85*d[...,None]+.55*b[...,None])
    return c+(s**34)[...,None]*.95+(b**3*.3)[...,None]
def ground(d,s,st):
    # oxblood with a fine engine-turned line, so it reads as a printed metal ground, not plastic
    eng=.5+.5*np.cos((X*.7+Y)*W*.42)
    c=OX*(.62+.4*d[...,None])*(.9+.1*eng[...,None])
    return c+(band(.95+st*.55,.2)*.07)[...,None]*hexc('#ff9b6a')+(s**90)[...,None]*.15
STATES=(-1.,0.,1.);A={}
# photo
ph=Image.open('/mnt/user-data/attachments/d5c528f3-de72-5ee3-8398-0c88cf384ece/5122374a-image.jpg').convert('RGB')
bw,bh=.88,H-.12;tw,th=int(bw*1200),int(bh*1200)
sc=max(tw/ph.width,th/ph.height);ph=ph.resize((int(ph.width*sc+1),int(ph.height*sc+1)),Image.LANCZOS)
ox=int((ph.width-tw)*.52);oy=int((ph.height-th)*.30);ph=ph.crop((ox,oy,ox+tw,oy+th))
p=np.asarray(ph).astype('f4')/255
sep=np.stack([p@np.array([.393,.769,.189]),p@np.array([.349,.686,.168]),p@np.array([.272,.534,.131])],-1);p=p*(1-.42)+np.clip(sep,0,1)*.42
lum=(p@np.array([.2126,.7152,.0722],'f4'))[...,None];p=lum+(p-lum)*1.25;p=np.clip(((p-.5)*1.22+.5)*.94,0,1)
yy=np.linspace(0,1,th)[:,None,None];xx=np.linspace(0,1,tw)[None,:,None]
g=np.clip(1-yy*1.1-xx*.2+.15,0,1);wash=hexc('#ffc24a')*g+hexc('#d8321f')*(1-g)
def soft(b,s):
    D=np.where(b<=.25,((16*b-12)*b+4)*b,np.sqrt(b));return np.where(s<=.5,b-(1-2*s)*b*(1-b),b+(2*s-1)*(D-b))
p=p*(1-.62)+soft(p,wash)*.62
r=np.sqrt(((xx-.5)/.62)**2+((yy-.42)/.7)**2);p=p*(1-.55*np.clip(r-.55,0,1)**1.4)
gr=G(np.random.randn(th,tw).astype('f4'),.55);gr/=gr.std();p=np.clip(p+gr[...,None]*.028,0,1)
b0=io.BytesIO();Image.fromarray(u8(p)).save(b0,'JPEG',quality=90,optimize=True,subsampling=0)
A['photo']='data:image/jpeg;base64,'+base64.b64encode(b0.getvalue()).decode()
def faces(orn,foilm,extra_ground,front):
    hO=G(orn,.9)*.9+G(foilm,.9)*.7
    if front:hO=hO+extra_ground*.25
    nO=normals(G(hO,.7),.0062)
    shadow=G(np.roll(np.roll(np.maximum(orn,foilm),5,0),4,1),3)
    out=[]
    for st in STATES:
        d,s=light(nO,st*.7)
        gr_=ground(d,s,st)*(1-.55*shadow*(1-np.maximum(orn,foilm)))[...,None]
        gc=gold(d,s,st,nO[1]*-1)
        c=gr_*(1-orn[...,None])+gc*orn[...,None]
        c=c*(1-foilm[...,None])+gold(d,s,st,nO[1]*-1)*foilm[...,None]
        rim=ss(-.003,0,cd);c=c*(1-rim[...,None]*.75)
        out.append((c,shadow))
    return out
# front
orn=m('f_orn');word=m('f_word');cart=m('f_cart');sig=m('f_sig')
win=1-ss(-.0006,.0006,wd)
# the cartouche is a filled oxblood plate sitting over the photo
plate=np.maximum(1-win,cart)
res=faces(orn,word,cart,True)
hS=G(sig,1.4);nS=normals(hS,.006);sigS=G(np.roll(np.roll(sig,7,0),5,1),3.5)
for i,(c,shadow) in enumerate(res):
    st=STATES[i]
    alpha=np.maximum(plate,orn)
    # ornaments and cartouche throw a soft shadow onto the photo
    sh=np.clip(shadow*.7+ss(-.02,0,wd)*.45,0,1)*(1-alpha)
    rgb=c*alpha[...,None]
    a2=alpha+sh
    rgb=rgb+np.array([.08,0,.01],'f4')*sh[...,None]
    d2,s2=light(nS,st*.7);scol=foil(YEL,d2,s2,st)
    a3=np.maximum(a2,sigS*.6*(1-alpha));rgb=rgb+np.array([.12,0,0],'f4')*(a3-a2)[...,None]
    rgb=rgb*(1-sig[...,None])+scol*sig[...,None];a3=np.maximum(a3,sig)
    gloss=band(.95+st*.55,.2)*win*.08;rgb=rgb+gloss[...,None];a3=np.clip(a3+gloss,0,1)
    rgb=rgb/np.maximum(a3,1e-4)[...,None]
    A[f'front{i}']=enc(np.dstack([u8(rgb),u8(a3*cardm)]))
# back
orn=m('b_orn');fo=m('b_foil')
ys=m('b_foil')*0
res=faces(orn,np.zeros_like(orn),None,False)
hF=G(fo,1.1);nF=normals(hF,.006)
for i,(c,shadow) in enumerate(res):
    st=STATES[i];d,s=light(nF,st*.7)
    shF=G(np.roll(np.roll(fo,5,0),4,1),2.5)
    c=c*(1-.5*shF*(1-fo))[...,None]
    c=c*(1-fo[...,None])+foil(YEL,d,s,st)*fo[...,None]
    A[f'back{i}']=enc(np.dstack([u8(c),u8(cardm)]))
print({k:round(len(v)/1024) for k,v in A.items()})
s=open('card6.src.html').read()
for k,v in A.items():s=s.replace(f'__{k}__',v)
open('wash-card.html','w').write(s);print(round(len(s)/1048576,2),'MB')
