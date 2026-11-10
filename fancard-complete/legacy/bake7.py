import numpy as np,io,base64
from PIL import Image
from scipy.ndimage import gaussian_filter as G, uniform_filter1d as U1
W=1080;HP=1669;H=HP/W
xs=(np.arange(W)+.5)/W;ys=(np.arange(HP)+.5)/W
X,Y=np.meshgrid(xs,ys);X=X.astype('f4');Y=Y.astype('f4')
def ss(a,b,v):t=np.clip((v-a)/(b-a),0,1);return t*t*(3-2*t)
def rr(cx,cy,hx,hy,r):
    qx=np.abs(X-cx)-hx+r;qy=np.abs(Y-cy)-hy+r
    return np.hypot(np.maximum(qx,0),np.maximum(qy,0))+np.minimum(np.maximum(qx,qy),0)-r
def m(n):return np.asarray(Image.open(f'bake7/{n}.png'))[...,3].astype('f4')/255
u8=lambda a:(np.clip(a,0,1)*255+.5).astype('u1')
def hexc(h):return np.array([int(h[k:k+2],16)/255 for k in(1,3,5)],'f4')
def normals(h,k):
    gy,gx=np.gradient(h);gx*=W;gy*=W;nx,ny=-gx*k,-gy*k;l=np.sqrt(nx*nx+ny*ny+1);return nx/l,ny/l,1/l
def light(n,lx):
    L=np.array([lx,-.55,.8],'f4');L/=np.linalg.norm(L);Hh=L+np.array([0,0,1],'f4');Hh/=np.linalg.norm(Hh)
    return np.clip(n[0]*L[0]+n[1]*L[1]+n[2]*L[2],0,1),np.clip(n[0]*Hh[0]+n[1]*Hh[1]+n[2]*Hh[2],0,1)
def band(c,w):v=X*.927+Y*.375;return np.exp(-((v-c)/w)**2)
def enc(rgba,q=90):
    b=io.BytesIO();Image.fromarray(rgba,'RGBA').save(b,'WEBP',quality=q,method=6,alpha_quality=100)
    return 'data:image/webp;base64,'+base64.b64encode(b.getvalue()).decode()
np.random.seed(11)
# ---- the stamp silhouette: perforated all round ----
pr=.016;pitch=.046
outer=rr(.5,H/2,.5-.006,H/2-.006,.004)
holes=np.full_like(X,1e3)
def perf(x0,y0,x1,y1):
    global holes
    L=np.hypot(x1-x0,y1-y0);n=int(round(L/pitch))
    for i in range(n+1):
        t=i/n;cx,cy=x0+(x1-x0)*t,y0+(y1-y0)*t;holes=np.minimum(holes,np.hypot(X-cx,Y-cy)-pr)
e=.006;perf(e,e,1-e,e);perf(e,H-e,1-e,H-e);perf(e,e,e,H-e);perf(1-e,e,1-e,H-e)
cd=np.maximum(outer,-holes)
cardm=1-ss(-.0009,.0009,cd)
wy=H-.27
wd=rr(.5,(.075+wy)/2,.425,(wy-.075)/2,.004)
win=1-ss(-.0006,.0006,wd)
# brushed lilac-silver foil for the stamp margin
def noise(sx):
    n=np.random.randn(HP,W).astype('f4');n=U1(n,sx,axis=1,mode='wrap');return n/n.std()
br=.6*noise(380)+.4*noise(90)
def studio(nx,ny,tx,ty):
    t=ny*1.5+nx*.75+ty*.62-tx*.5+(Y/H-.5)*.62+(X-.5)*.26
    g=lambda c,s:np.exp(-(t-c)**2/(2*s*s))
    return .06+1.3*g(.34,.11)+.72*g(-.42,.19)+.5*g(1.02,.2)+.3*g(-1.1,.3)
FOILC=hexc('#dcd4f2');INK=hexc('#2b2370');GOLD=hexc('#f0b35e');GOLD2=hexc('#9c5b25');VIO=hexc('#2a1556');RED=hexc('#d8322a');ORANGE=hexc('#ff7a2a')
def silver(n,st):
    env=studio(n[0],n[1]+br*.035,st*.65,-st*.22)
    L=(.42+env*.55)*(1+br*.03)
    return FOILC*np.clip(L,0,1.3)[...,None]+(band(.95+st*.55,.12)*.18)[...,None]
def gold(d,s,st,ny):
    b=band(.95+st*.55,.13);t=np.clip(.5+ny*1.6,0,1)[...,None];base=GOLD2*(1-t)+GOLD*t
    return base*(.42+.85*d[...,None]+.55*b[...,None])+(s**34)[...,None]*.9+(b**3*.3)[...,None]
STATES=(-1.,0.,1.);A={}
# ---- photo: indigo / violet moonlight grade ----
ph=Image.open('/mnt/user-data/attachments/d5c528f3-de72-5ee3-8398-0c88cf384ece/b96d1039-image.jpg').convert('RGB')
bw,bh=.85,wy-.075;tw,th=int(bw*1250),int(bh*1250)
sc=max(tw/ph.width,th/ph.height);ph=ph.resize((int(ph.width*sc+1),int(ph.height*sc+1)),Image.LANCZOS)
ox=int((ph.width-tw)*.5);oy=int((ph.height-th)*.42);ph=ph.crop((ox,oy,ox+tw,oy+th))
p=np.asarray(ph).astype('f4')/255
lum=(p@np.array([.2126,.7152,.0722],'f4'))[...,None]
sh=hexc('#120f4a');hi=hexc('#e6dcff');tone=sh*(1-lum)+hi*lum
p=p*.45+tone*.55
lum=(p@np.array([.2126,.7152,.0722],'f4'))[...,None];p=lum+(p-lum)*1.3
p=np.clip((p-.5)*1.18+.5,0,1)
yy=np.linspace(0,1,th)[:,None,None];xx=np.linspace(0,1,tw)[None,:,None]
g=np.clip(1-yy*1.05+xx*.15,0,1);wash=hexc('#7a52e0')*g+hexc('#1e57d6')*(1-g)
def soft(b,s):
    D=np.where(b<=.25,((16*b-12)*b+4)*b,np.sqrt(b));return np.where(s<=.5,b-(1-2*s)*b*(1-b),b+(2*s-1)*(D-b))
p=p*.45+soft(p,wash)*.55
r=np.sqrt(((xx-.5)/.65)**2+((yy-.45)/.72)**2);p=p*(1-.5*np.clip(r-.55,0,1)**1.4)
gr=G(np.random.randn(th,tw).astype('f4'),.55);gr/=gr.std();p=np.clip(p+gr[...,None]*.024,0,1)
b0=io.BytesIO();Image.fromarray(u8(p)).save(b0,'JPEG',quality=90,optimize=True,subsampling=0)
A['photo']='data:image/jpeg;base64,'+base64.b64encode(b0.getvalue()).decode()
# ---- front ----
txt=m('f_txt');star=m('f_star');seal=m('f_seal');staff=m('f_staff');sig=m('f_sig')
# margin relief: bevel at the window, a fine engraved line, tiny wave scales tone-on-tone
R=.03;rowp=R*.5
q=np.zeros_like(X)
iy=np.floor(Y/rowp);off=(iy%2)*R;cx=np.round((X-off)/(2*R))*2*R+off;cy=iy*rowp
for dy in(0,1):
    yy0=(iy+dy)*rowp;off2=((iy+dy)%2)*R;cx2=np.round((X-off2)/(2*R))*2*R+off2
    d=np.hypot(X-cx2,Y-yy0);ok=(Y<=yy0+1e-6)
    ring=np.abs(np.cos(d/R*4.3*np.pi))**8*(d<R)*ok
    q=np.maximum(q,ring)
scales=q*(1-win)*(staff<.01)*ss(.02,.03,-cd)*(1-ss(-.014,-.002,wd)*0)
hF=ss(0,.006,wd)*ss(0,.008,-cd)+scales*.06+staff*.25+(1-ss(.0015,.003,np.abs(wd-.012)))*.25
nF=normals(G(hF,.8),.006)
hS=G(sig,1.2);nS=normals(hS,.006)
for i,st in enumerate(STATES):
    c=silver(nF,st)
    c=c*(1-scales[...,None]*.1)
    c=c*(1-staff[...,None]*.85)+INK*staff[...,None]*.85+INK*0
    d2,s2=light(nS,st*.7);inkc=INK*(.75+.4*d2[...,None])+(s2**50)[...,None]*.5
    rim=ss(-.003,0,cd);c=c*(1-rim[...,None]*.6)
    alpha=(1-win)*1.0
    # window: inner shadow, lettering, star, seal
    shd=ss(-.018,0,wd)*win
    rgb=c*alpha[...,None]
    a2=alpha+shd*.4;rgb=rgb+np.array([.03,.02,.1],'f4')*(shd*.4)[...,None]
    tsh=G(np.roll(np.roll(np.maximum(txt,star),3,0),2,1),2)*win*(1-np.maximum(txt,star))
    a3=np.clip(a2+tsh*.35,0,1);rgb=rgb+np.array([.03,.02,.12],'f4')*(a3-a2)[...,None]
    rgb=rgb*(1-txt[...,None])+np.array([1,1,1],'f4')*.97*txt[...,None];a3=np.maximum(a3,txt)
    oc=ORANGE*(.85+.3*band(.95+st*.55,.15))[...,None];rgb=rgb*(1-star[...,None])+oc*star[...,None];a3=np.maximum(a3,star)
    rgb=rgb*(1-seal[...,None])+RED*seal[...,None];a3=np.maximum(a3,seal*.92)
    rgb=rgb*(1-sig[...,None])+inkc*sig[...,None];a3=np.maximum(a3,sig)
    gloss=band(.95+st*.55,.2)*win*.07;rgb=rgb+gloss[...,None];a3=np.clip(a3+gloss,0,1)
    rgb=rgb/np.maximum(a3,1e-4)[...,None]
    A[f'front{i}']=enc(np.dstack([u8(rgb),u8(a3*cardm)]))
# ---- back: violet field, copper-gold wave scales, postmark, signature ----
orn=m('b_orn');fo=m('b_foil')
field=1-ss(-.0006,.0006,rr(.5,H/2,.425,H/2-.075,.004))
hB=ss(0,.006,-rr(.5,H/2,.425,H/2-.075,.004))*0+G(orn,.9)*.8+G(fo,.9)*.9+ss(0,.006,-cd)*.2
nB=normals(G(hB,.7),.006)
shadow=G(np.roll(np.roll(np.maximum(orn,fo),4,0),3,1),2.5)
for i,st in enumerate(STATES):
    d,s=light(nB,st*.7)
    gv=VIO*(.72+.35*d[...,None])*(1-.5*shadow*(1-np.maximum(orn,fo)))[...,None]+(band(.95+st*.55,.2)*.06)[...,None]*hexc('#9b7bff')
    gc=gold(d,s,st,-nB[1])
    c=gv*(1-orn[...,None])+gc*orn[...,None]
    c=c*(1-fo[...,None])+gc*fo[...,None]
    mc=silver(normals(ss(0,.008,-cd)*1.0+(1-ss(-.0006,.0006,-rr(.5,H/2,.425,H/2-.075,.004)))*0,.006),st)
    c=c*field[...,None]+mc*(1-field)[...,None]
    rim=ss(-.003,0,cd);c=c*(1-rim[...,None]*.6)
    A[f'back{i}']=enc(np.dstack([u8(c),u8(cardm)]))
print({k:round(len(v)/1024) for k,v in A.items()})
s=open('card7.src.html').read()
for k,v in A.items():s=s.replace(f'__{k}__',v)
open('muse-card.html','w').write(s);print(round(len(s)/1048576,2),'MB')
