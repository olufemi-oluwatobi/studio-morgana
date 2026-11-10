import numpy as np,io,base64
from PIL import Image
from scipy.ndimage import gaussian_filter as G
W=1080;HP=1669;H=HP/W
xs=(np.arange(W)+.5)/W;ys=(np.arange(HP)+.5)/W
X,Y=np.meshgrid(xs,ys);X=X.astype('f4');Y=Y.astype('f4')
def ss(a,b,v):t=np.clip((v-a)/(b-a),0,1);return t*t*(3-2*t)
def rr(cx,cy,hx,hy,r):
    qx=np.abs(X-cx)-hx+r;qy=np.abs(Y-cy)-hy+r
    return np.hypot(np.maximum(qx,0),np.maximum(qy,0))+np.minimum(np.maximum(qx,qy),0)-r
def smax(a,b,k):h=np.maximum(k-np.abs(a-b),0)/k;return np.maximum(a,b)+h*h*k*.25
def m(n):return np.asarray(Image.open(f'bake5/{n}.png'))[...,3].astype('f4')/255
u8=lambda a:(np.clip(a,0,1)*255+.5).astype('u1')
def hexc(h):return np.array([int(h[k:k+2],16)/255 for k in(1,3,5)],'f4')
RED=hexc('#c4221a');RED2=hexc('#8f130e');YEL=hexc('#ffc925');YEL2=hexc('#e89a10')
cd=rr(.5,H/2,.49,H/2-.01,.05)
tab=rr(.5,.03,.19,.09,.03)
wd=smax(rr(.5,H/2,.452,H/2-.048,.034),-tab,.03)
cardm=1-ss(-.0009,.0009,cd)
def normals(h,k):
    gy,gx=np.gradient(h);gx*=W;gy*=W;nx,ny=-gx*k,-gy*k;l=np.sqrt(nx*nx+ny*ny+1);return nx/l,ny/l,1/l
def light(n,lx):
    L=np.array([lx,-.55,.8],'f4');L/=np.linalg.norm(L);Hh=L+np.array([0,0,1],'f4');Hh/=np.linalg.norm(Hh)
    d=np.clip(n[0]*L[0]+n[1]*L[1]+n[2]*L[2],0,1);s=np.clip(n[0]*Hh[0]+n[1]*Hh[1]+n[2]*Hh[2],0,1)
    return d,s
def band(c,w):v=X*.927+Y*.375;return np.exp(-((v-c)/w)**2)
def enc(rgba,q=90):
    b=io.BytesIO();Image.fromarray(rgba,'RGBA').save(b,'WEBP',quality=q,method=6,alpha_quality=100)
    return 'data:image/webp;base64,'+base64.b64encode(b.getvalue()).decode()
np.random.seed(3)
grainE=G(np.random.randn(HP,W).astype('f4'),.6);grainE/=grainE.std()
def enamel(col,d,s,st):
    c=col*(.5+.62*d[...,None])
    c=c*(1+grainE[...,None]*.012)
    c=c+(s**70)[...,None]*.75+(band(.95+st*.55,.16)*.16)[...,None]
    return c
def foil(col,d,s,st):
    b=band(.95+st*.55,.12)
    c=col*(.38+.85*d[...,None]+.5*b[...,None])
    return c+(s**40)[...,None]*.9+(b**3*.35)[...,None]
STATES=(-1.,0.,1.);A={}
# ---------- photo: full frame, cinematic wash ----------
ph=Image.open('/mnt/user-data/attachments/d5c528f3-de72-5ee3-8398-0c88cf384ece/5122374a-image.jpg').convert('RGB')
bw,bh=.904,H-.096;tw,th=int(bw*1200),int(bh*1200)
s=max(tw/ph.width,th/ph.height);ph=ph.resize((int(ph.width*s+1),int(ph.height*s+1)),Image.LANCZOS)
ox=int((ph.width-tw)*.52);oy=int((ph.height-th)*.30);ph=ph.crop((ox,oy,ox+tw,oy+th))
p=np.asarray(ph).astype('f4')/255
sep=np.stack([p@np.array([.393,.769,.189]),p@np.array([.349,.686,.168]),p@np.array([.272,.534,.131])],-1);p=p*(1-.42)+np.clip(sep,0,1)*.42
lum=(p@np.array([.2126,.7152,.0722],'f4'))[...,None];p=lum+(p-lum)*1.25
p=(p-.5)*1.22+.5;p=np.clip(p*.94,0,1)
yy=np.linspace(0,1,th)[:,None,None];xx=np.linspace(0,1,tw)[None,:,None]
g=np.clip(1-yy*1.1-xx*.2+.15,0,1);wash=hexc('#ffc24a')*g+hexc('#d8321f')*(1-g)
def soft(b,s):
    D=np.where(b<=.25,((16*b-12)*b+4)*b,np.sqrt(b))
    return np.where(s<=.5,b-(1-2*s)*b*(1-b),b+(2*s-1)*(D-b))
p=p*(1-.62)+soft(p,wash)*.62
r=np.sqrt(((xx-.5)/.62)**2+((yy-.42)/.7)**2);p=p*(1-.55*np.clip(r-.55,0,1)**1.4)
gr=G(np.random.randn(th,tw).astype('f4'),.55);gr/=gr.std();p=np.clip(p+gr[...,None]*.028,0,1)
b0=io.BytesIO();Image.fromarray(u8(p)).save(b0,'JPEG',quality=90,optimize=True,subsampling=0)
A['photo']='data:image/jpeg;base64,'+base64.b64encode(b0.getvalue()).decode()
# ---------- front: red enamel frame, yellow tab, yellow keyline, foil signature ----------
word=m('f_word');sig=m('f_sig')
frame=1-ss(-.0006,.0006,wd)          # 1 inside window
fr=(1-frame)*cardm
intab=1-ss(-.0006,.0006,tab)
key=(1-ss(.0022,.0042,np.abs(wd-.011)))*(1-intab)
hF=ss(0,.007,wd)*ss(0,.007,-cd)+key*.35+word*.4
nF=normals(G(hF,1.1),.0055)
sigS=G(np.roll(np.roll(sig,7,0),5,1),3.5)
hS=G(sig,1.4);nS=normals(hS,.006)
for i,st in enumerate(STATES):
    d,s=light(nF,st*.7)
    base=np.where(intab[...,None]>.5,YEL,RED)
    c=enamel(base,d,s,st)
    kc=foil(YEL,d,s,st);c=c*(1-key[...,None])+kc*key[...,None]
    wc=enamel(RED,d,s,st);c=c*(1-word[...,None])+wc*word[...,None]
    rim=ss(-.003,0,cd);c=c*(1-rim[...,None]*.7)
    alpha=fr.copy()
    # inner shadow cast by the frame onto the photo
    sh=ss(-.022,0,wd)*frame;
    # signature: yellow foil with a deep red drop
    d2,s2=light(nS,st*.7);sc=foil(YEL,d2,s2,st)
    gloss=band(.95+st*.55,.2)*frame*.10
    rgb=c*fr[...,None]
    a_win=np.clip(sh*.45+sigS*.6+gloss,0,1)
    col_win=np.zeros_like(c)+np.array([.12,0,0],'f4');col_win=col_win*(1-(gloss/np.maximum(a_win,1e-4))[...,None])+(gloss/np.maximum(a_win,1e-4))[...,None]
    rgb=rgb+col_win*(a_win*frame)[...,None];alpha=alpha+a_win*frame
    rgb=rgb*(1-sig[...,None])+sc*sig[...,None]*1;alpha=np.maximum(alpha,sig)
    rgb=rgb/np.maximum(alpha,1e-4)[...,None]
    A[f'front{i}']=enc(np.dstack([u8(rgb),u8(alpha*cardm)]))
# ---------- back: flat red enamel, tone-on-tone ticket, yellow foil ----------
rel=m('b_rel');fo=m('b_foil')
inner=rr(.5,H/2,.44,H/2-.04,.035)
# ticket notches at both sides
notch=np.minimum(np.hypot(X-.06,Y-H/2)-.05,np.hypot(X-.94,Y-H/2)-.05)
tk=smax(inner,-notch,.01)
line1=1-ss(.0016,.003,np.abs(tk))
line2=1-ss(.0012,.0024,np.abs(tk+.018))
# sprocket holes along both long edges
sp=np.ones_like(X)*1e3
for yv in np.arange(.13,H-.1,.062):
    for xv in(.105,.895):
        if abs(yv-H/2)<.09:continue
        sp=np.minimum(sp,rr(xv,yv,.016,.011,.005))
hole=1-ss(-.001,.001,sp)
# setting sun with rays, framing the serial
sx,sy=.5,.86
rad=np.hypot(X-sx,Y-sy);ang=np.arctan2(Y-sy,X-sx)
disc=(1-ss(.215,.218,rad))
rays=(np.cos(ang*36)>.55)*ss(.235,.24,rad)*(1-ss(.36,.37,rad))*(Y<sy+.02)
ring=1-ss(.0015,.003,np.abs(rad-.226))
# tide lines under the sun
waves=np.zeros_like(X)
for k in range(4):
    yv=1.04+k*.03;yl=yv+.008*np.sin(X*40+k*1.3)
    waves=np.maximum(waves,(1-ss(.0016,.003,np.abs(Y-yl)))*ss(.16,.2,X)*(1-ss(.8,.84,X)))
hB=line1*.5+line2*.35-hole*.7+disc*.18+rays*.45+ring*.5+waves*.45+G(rel,.4)*.55+fo*.6
hB=hB*(1-ss(-.004,0,cd))
nB=normals(G(hB,.8),.0048)
for i,st in enumerate(STATES):
    d,s=light(nB,st*.7)
    c=enamel(RED,d,s,st)
    c=np.where(hole[...,None]>.5,c*.55,c)
    c=c*(1-.2*rel[...,None])
    fc=foil(YEL,d,s,st);c=c*(1-fo[...,None])+fc*fo[...,None]
    rim=ss(-.003,0,cd);c=c*(1-rim[...,None]*.7)
    A[f'back{i}']=enc(np.dstack([u8(c),u8(cardm)]))
print({k:round(len(v)/1024) for k,v in A.items()})
s=open('card5.src.html').read()
for k,v in A.items():s=s.replace(f'__{k}__',v)
open('wash-card.html','w').write(s);print(round(len(s)/1048576,2),'MB')
