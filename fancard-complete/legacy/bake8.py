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
def chamf(cx,cy,hx,hy,c):return ((np.abs(X-cx)-hx)+(np.abs(Y-cy)-hy)+c)/np.sqrt(2)
def m(n):return np.asarray(Image.open(f'bake8/{n}.png'))[...,3].astype('f4')/255
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
np.random.seed(21)
def noise(sx):
    n=np.random.randn(HP,W).astype('f4');n=U1(n,sx,axis=1,mode='wrap');return n/n.std()
br=.6*noise(380)+.4*noise(90)
grain=G(np.random.randn(HP,W).astype('f4'),.8);grain/=grain.std()
def studio(nx,ny,tx,ty):
    t=ny*1.5+nx*.75+ty*.62-tx*.5+(Y/H-.5)*.62+(X-.5)*.26
    g=lambda c,s:np.exp(-(t-c)**2/(2*s*s))
    return .04+1.35*g(.34,.1)+.7*g(-.42,.18)+.5*g(1.02,.2)+.3*g(-1.1,.3)
MAG=hexc('#ff2bd6');BLU=hexc('#3d5bff');GUN=hexc('#8e93a8');LEA=hexc('#18141d')
neonmix=np.clip(X*.75+Y/H*.35-.05,0,1)[...,None];NEON=MAG*(1-neonmix)+BLU*neonmix
# ---- shapes ----
cd=np.maximum(rr(.5,H/2,.49,H/2-.01,.015),chamf(.5,H/2,.49,H/2-.01,.07))
cardm=1-ss(-.0009,.0009,cd)
wy0,wy1=.065,H-.155;wcx,wcy,whx,why=.5,(wy0+wy1)/2,.435,(wy1-wy0)/2
wd=np.maximum(rr(wcx,wcy,whx,why,.008),chamf(wcx,wcy,whx,why,.05))
win=1-ss(-.0006,.0006,wd)
plate=rr(.5,H-.083,.39,.042,.01)
# harness straps across each photo corner, an O-ring on each
a=whx-np.abs(X-wcx);b=why-np.abs(Y-wcy)
sl=(a+b-.205)/np.sqrt(2);st_=(a-b)/np.sqrt(2)
strap=(1-ss(.019,.021,np.abs(sl)))*(a>-.06)*(b>-.06)*(np.abs(st_)<.2)
stitch=(1-ss(.0012,.0024,np.abs(np.abs(sl)-.0135)))*(np.cos(st_*W*.11)>.2)*strap
ringC=[];hc=.1025
for sx in(-1,1):
    for sy in(-1,1):ringC.append((wcx+sx*(whx-hc),wcy+sy*(why-hc)))
ringH=np.zeros_like(X);ringM=np.zeros_like(X)
def torus(cx,cy,R,w):
    d=np.hypot(X-cx,Y-cy)-R;t=np.clip(1-(d/w)**2,0,1);return np.sqrt(t),(np.abs(d)<w).astype('f4')
for cx,cy in ringC:
    h,mm=torus(cx,cy,.031,.0085);ringH=np.maximum(ringH,h);ringM=np.maximum(ringM,mm)
# collar D-ring hanging from the top edge into the picture
dh,dm=torus(.5,.06,.045,.009);dm=dm*(Y>.06);dh=dh*(Y>.06)
tabd=rr(.5,.04,.026,.014,.012);tab=1-ss(-.0006,.0006,tabd)
ringH=np.maximum(ringH,dh);ringM=np.maximum(ringM,dm)
# rivets around the frame
rivH=np.zeros_like(X)
def rivet(cx,cy,r=.0085):
    global rivH;d=np.hypot(X-cx,Y-cy);rivH=np.maximum(rivH,np.sqrt(np.clip(1-(d/r)**2,0,1)))
fx=(.49+whx)/2
for yv in np.arange(.2,H-.25,.11):rivet(.5-fx,yv);rivet(.5+fx,yv)
for xv in(.22,.36,.64,.78):rivet(xv,(wy0+.01)/2+.003)
rivet(.17,H-.083);rivet(.83+.04,H-.083) if False else None
neon=(1-ss(.0012,.0028,np.abs(wd-.0045)))
glow=G(neon,6)*1.6
def metal(n,st):
    env=studio(n[0],n[1]+br*.03,st*.65,-st*.22)
    c=GUN*(.16+env*.62)[...,None]*(1+br[...,None]*.03)
    c=c+NEON*(np.clip(n[0]*-1.5+.2,0,1)*.0+env*.06)[...,None]
    return c+(band(.95+st*.55,.12)*.1)[...,None]
def chrome(n,st):
    env=studio(n[0]*2,n[1]*2,st*.65,-st*.22)
    tint=MAG*np.clip(.5-n[0]*2,0,1)[...,None]+BLU*np.clip(.5+n[0]*2,0,1)[...,None]
    return (.05+env*1.05)[...,None]*(np.array([.95,.95,1.],'f4')*.7+tint*.3)
def leather(n,st):
    d,s=light(n,st*.7)
    return LEA*(.55+.6*d[...,None])*(1+grain[...,None]*.06)+(s**28)[...,None]*.22+NEON*(s**10*.06)[...,None]
STATES=(-1.,0.,1.);A={}
# ---- photo: its own light, untouched ----
ph=Image.open('/mnt/user-data/attachments/d5c528f3-de72-5ee3-8398-0c88cf384ece/715490db-image.jpg').convert('RGB')
bw,bh=2*whx,2*why;tw,th=int(bw*1250),int(bh*1250)
sc=max(tw/ph.width,th/ph.height);ph=ph.resize((int(ph.width*sc+1),int(ph.height*sc+1)),Image.LANCZOS)
ox=int((ph.width-tw)*.5);oy=int((ph.height-th)*.2);ph=ph.crop((ox,oy,ox+tw,oy+th))
b0=io.BytesIO();ph.save(b0,'JPEG',quality=90,optimize=True,subsampling=0)
A['photo']='data:image/jpeg;base64,'+base64.b64encode(b0.getvalue()).decode()
eng=m('f_eng')
hF=ss(0,.006,wd)*ss(0,.008,-cd)*.6-(1-ss(-.0015,.0015,plate))*.18+ss(0,.004,-plate)*0-eng*.25
hS=strap*.45-stitch*.12
hR=ringH*.9+rivH*.6+G(tab,4)*.8
nF=normals(G(hF,.9),.006);nS=normals(G(hS,1.),.006);nR=normals(G(hR,.6),.009)
under=G(np.roll(np.roll(np.maximum(np.maximum(strap,ringM),rivH>0),6,0),5,1),4)
for i,st in enumerate(STATES):
    c=metal(nF,st)
    inplate=(1-ss(-.0015,.0015,plate))
    c=c*(1-inplate[...,None]*.35)
    c=c*(1-eng[...,None]*.55)
    alpha=1-win
    rgb=c*alpha[...,None]
    shd=ss(-.02,0,wd)*win
    a2=alpha+shd*.5
    a2=np.clip(a2+under*.55*win*(1-strap),0,1)
    lc=leather(nS,st);sm=strap*(1-ringM)
    rgb=rgb*(1-sm[...,None])+lc*sm[...,None];a2=np.maximum(a2,sm)
    cc=chrome(nR,st);hm=np.maximum(np.maximum(ringM,(rivH>0).astype('f4')),tab)
    rgb=rgb*(1-hm[...,None])+cc*hm[...,None];a2=np.maximum(a2,hm)
    ne=np.clip(neon+glow*.0,0,1)
    rgb=rgb*(1-ne[...,None])+NEON*1.15*ne[...,None];a2=np.maximum(a2,ne)
    gl=np.clip(glow*.35*(1-win),0,1);rgb=rgb+NEON*gl[...,None]
    gw=np.clip(glow*.22*win*(1-a2),0,.4);rgb=rgb+NEON*gw[...,None];a2=np.clip(a2+gw,0,1)
    gloss=band(.95+st*.55,.2)*win*.05;rgb=rgb+gloss[...,None];a2=np.clip(a2+gloss,0,1)
    rgb=rgb/np.maximum(a2,1e-4)[...,None]
    rim=ss(-.003,0,cd);rgb=rgb*(1-rim[...,None]*.6)
    A[f'front{i}']=enc(np.dstack([u8(rgb),u8(a2*cardm)]))
# ---- back: steel, crossed harness straps, big O-ring plate ----
beng=m('b_eng');cx,cy=.5,.74
inner=np.maximum(rr(.5,H/2,.46,H/2-.04,.012),chamf(.5,H/2,.46,H/2-.04,.055))
bneon=(1-ss(.0012,.0028,np.abs(inner)));bglow=G(bneon,6)*1.6
def strapline(ang,cx,cy,w=.032):
    ca,sa=np.cos(ang),np.sin(ang);d=(X-cx)*-sa+(Y-cy)*ca;t=(X-cx)*ca+(Y-cy)*sa
    return (1-ss(w*.9,w,np.abs(d)))*(inner<-.004),d,t
s1,d1,t1=strapline(1.0,cx,cy);s2,d2,t2=strapline(-1.0+np.pi,cx,cy)
s3,d3,t3=strapline(0,cx,.3,.024);s4,d4,t4=strapline(0,cx,1.22,.024)
straps=np.clip(s1+s2+s3+s4,0,1)
st1=lambda s,d,t,w=.032:(1-ss(.0012,.0024,np.abs(np.abs(d)-w*.7)))*(np.cos(t*W*.11)>.2)*s
stitches=np.clip(st1(s1,d1,t1)+st1(s2,d2,t2)+st1(s3,d3,t3,.024)+st1(s4,d4,t4,.024),0,1)
bigR,bigRm=torus(cx,cy,.15,.022)
disc=rr(cx,cy,.122,.122,.122);discm=1-ss(-.0008,.0008,disc)
rivH=np.zeros_like(X)
for xv in(.16,.84):
    for yv in(.3,1.22):rivet(xv,yv,.011)
for t in(.28,.4):
    for ang in(1.0,-1.0+np.pi):
        for sg in(1,-1):rivet(cx+np.cos(ang)*t*sg,cy+np.sin(ang)*t*sg,.01)
bplate=rr(.5,H-.09,.12,.045,.012);bpm=1-ss(-.0008,.0008,bplate)
hB=-bpm*.15+ss(0,.004,-cd)*.3-beng*.25
nB=normals(G(hB,.9),.006);nBS=normals(G(straps*.45-stitches*.12,1.),.006)
nBR=normals(G(bigR*1.+rivH*.6,.6),.009);nD=normals(G(-beng*.3*discm,.8),.006)
bunder=G(np.roll(np.roll(np.maximum(straps,np.maximum(bigRm,discm)),6,0),5,1),5)
for i,st in enumerate(STATES):
    c=metal(nB,st)*(1-bunder[...,None]*.5)
    c=c*(1-bpm[...,None]*.3)*(1-beng[...,None]*.5)
    lc=leather(nBS,st);c=c*(1-straps[...,None])+lc*straps[...,None]
    dc=chrome(nD,st)*.55+metal(nD,st)*.6;dc=dc*(1-beng[...,None]*.55)
    c=c*(1-discm[...,None])+dc*discm[...,None]
    cc=chrome(nBR,st);hm=np.maximum(bigRm,(rivH>0).astype('f4'))
    c=c*(1-hm[...,None])+cc*hm[...,None]
    c=c*(1-bneon[...,None])+NEON*1.15*bneon[...,None]+NEON*np.clip(bglow*.3,0,1)[...,None]
    rim=ss(-.003,0,cd);c=c*(1-rim[...,None]*.6)
    A[f'back{i}']=enc(np.dstack([u8(c),u8(cardm)]))
print({k:round(len(v)/1024) for k,v in A.items()})
s=open('card8.src.html').read()
for k,v in A.items():s=s.replace(f'__{k}__',v)
open('alpha-card.html','w').write(s);print(round(len(s)/1048576,2),'MB')
