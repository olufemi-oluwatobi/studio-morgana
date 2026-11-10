import numpy as np,io,base64,json
from PIL import Image
from scipy.ndimage import gaussian_filter as G,uniform_filter1d as U1,maximum_filter
W=1080;HP=1669;H=HP/W
np.random.seed(7)
xs=(np.arange(W)+.5)/W;ys=(np.arange(HP)+.5)/W
X,Y=np.meshgrid(xs,ys);X=X.astype('f4');Y=Y.astype('f4')
def ss(a,b,v):
    t=np.clip((v-a)/(b-a),0,1);return t*t*(3-2*t)
def rr(cx,cy,hx,hy,r):
    qx=np.abs(X-cx)-hx+r;qy=np.abs(Y-cy)-hy+r
    return np.hypot(np.maximum(qx,0),np.maximum(qy,0))+np.minimum(np.maximum(qx,qy),0)-r
def smax(a,b,k):
    h=np.maximum(k-np.abs(a-b),0)/k;return np.maximum(a,b)+h*h*k*.25
cd=rr(.5,H/2,.49,H/2-.01,.05)
wd=smax(rr(.5,(.05+1.30)/2,.45,(1.30-.05)/2,.028),-rr(.5,.04,.23,.125,.03),.035)
def mask(n):return np.asarray(Image.open(f'bake/m_{n}.png'))[...,3].astype('f4')/255
# brushed grain: long streaks across the card
def noise(sx,sy):
    n=np.random.randn(HP,W).astype('f4');n=U1(n,sx,axis=1,mode='wrap')
    if sy>1:n=U1(n,sy,axis=0,mode='wrap')
    return n/n.std()
br=.62*noise(420,1)+.38*noise(120,3)
def studio(nx,ny,tx,ty):
    t=ny*1.5+nx*.75+ty*.62-tx*.5+(Y/H-.5)*.62+(X-.5)*.26
    g=lambda c,s:np.exp(-(t-c)**2/(2*s*s))
    return .06+1.3*g(.34,.11)+.72*g(-.42,.19)+.5*g(1.02,.2)+.3*g(-1.1,.3)
def normals(h,k):
    gy,gx=np.gradient(h);gx*=W;gy*=W
    nx,ny=-gx*k,-gy*k;nz=np.ones_like(h);l=np.sqrt(nx*nx+ny*ny+1)
    return nx/l,ny/l,nz/l
def enc(a,fmt='JPEG',q=80):
    im=Image.fromarray(a);b=io.BytesIO()
    if fmt=='JPEG':im.convert('L' if a.ndim==2 else 'RGB').save(b,'JPEG',quality=q,optimize=True,subsampling=0 if a.ndim==3 else None) if a.ndim==3 else im.save(b,'JPEG',quality=q,optimize=True)
    else:im.save(b,'PNG',optimize=True)
    return f'data:image/{fmt.lower()};base64,'+base64.b64encode(b.getvalue()).decode()
u8=lambda a:(np.clip(a,0,1)*255+.5).astype('u1')
# shared relief
def relief(text):
    h=ss(0,.0075,-cd)                    # outer chamfer
    h=h*(.15+.85*ss(0,.0042,wd))         # window chamfer
    groove=np.zeros_like(h)
    return h,text,groove
# perlage for the back panel
def perlage():
    pitch=.058;rad=.05
    A=np.zeros((HP,W),'f4');R=np.ones((HP,W),'f4')
    rows=int(H/ (pitch*.86))+2;cols=int(1/pitch)+3
    for j in range(rows):
        cy=j*pitch*.86
        for i in range(cols):
            cx=(i+(.5 if j%2 else 0))*pitch-pitch
            x0=max(int((cx-rad)*W),0);x1=min(int((cx+rad)*W)+1,W);y0=max(int((cy-rad)*W),0);y1=min(int((cy+rad)*W)+1,HP)
            if x1<=x0 or y1<=y0:continue
            dx=X[y0:y1,x0:x1]-cx;dy=Y[y0:y1,x0:x1]-cy;r=np.hypot(dx,dy);m=r<rad
            A[y0:y1,x0:x1][m]=np.arctan2(dy,dx)[m];R[y0:y1,x0:x1][m]=(r/rad)[m]
    rings=G(np.random.randn(HP,W).astype('f4'),.7);rings/=rings.std()
    return A,R,rings
out={}
for face in('front','back'):
    text=mask(face)
    h,t,groove=relief(text)
    if face=='back':
        wings=mask('wings');num=mask('num')
        wh=G(wings,1.6)
        h=h+(wd<0)*.0+.0
        nW=normals(wh,.016)
        shadow=G(np.roll(np.roll(wings,10,axis=0),4,axis=1),7)
        A,R,rn=perlage()
    nx,ny,nz=normals(h,.0115)
    slope=1-nz
    cut=ss(.01,.09,slope)
    Ls=[]
    for tx,ty in((-.65,.22),(.65,-.22)):
        ny2=ny+br*.038
        env=studio(nx,ny2,tx,ty)
        L=.3+env*.72
        L=L*(1+br*.035)
        if face=='back':
            la=1.1+tx*1.15-ty*.6
            cone=np.abs(np.cos(A-la))**5+.45*np.abs(np.cos(A-la+1.3))**12
            pl=.14+.62*cone*(.82+.18*R)+rn*.022
            pl=pl*(.62+.38*(1-ss(.93,1.,R)))      # dark lip where one disc overlaps the next
            pl=pl*(1-.62*ss(-.032,0,wd))*(1-.68*shadow)
            L=np.where(wd<0,pl,L)
        L=L*(1-.62*G(np.roll(np.roll(text,2,axis=0),2,axis=1),1.6))
        Ls.append(L)
    # bare metal on top: cut edges, engraving
    env0=studio(nx,ny,0,0)
    silver=.42+env0*.68
    alpha=np.clip(cut*(wd>-.002),0,1)
    tedge=np.clip(text,0,1)
    txtenv=.9+.1*np.clip(studio(nx*0,ny*0+br*.03,0,0),0,1)
    rgb=silver*(1-tedge)+txtenv*tedge;alpha=np.maximum(alpha,tedge)
    # hairline groove: a dark cut with a lit lip
    gv=groove*(wd>0)*(1-tedge)
    rgb=rgb*(1-gv*.0)
    a=np.stack([rgb]*3,-1)
    if face=='back':
        wn=studio(nW[0],nW[1]+br*.02,0,0);ws=.46+wn*.72
        wa=np.clip(wings,0,1)
        a=a*(1-wa[...,None])+ws[...,None]*wa[...,None]
        alpha=np.maximum(alpha,wa)
        nm=G(num,.5)
        a=a*(1-nm[...,None])+np.array([.09,.06,.07],'f4')*nm[...,None]
    # darken the very rim so the silhouette is crisp
    rim=ss(-.0035,0,cd)
    a=a*(1-rim[...,None]*.72)
    alpha=np.maximum(alpha,rim*.95)
    if face=='front':
        # window shadow falling on the photo
        sh=ss(-.02,0,wd)*(wd<=0)
        a=a*(1-(sh>alpha)[...,None])
        alpha=np.maximum(alpha,sh*.42)
    rgba=np.dstack([u8(a),u8(alpha)])
    gl=np.clip(cut*(wd>-.002)*1.0+ (ss(.2,.9,text)*.0),0,1)
    if face=='back':gl=np.maximum(gl,G(wings,1)-G(wings,4)*.75)
    glint=np.dstack([np.full((HP,W,3),255,'u1'),u8(gl)])
    out[face]=dict(a=enc(u8(Ls[0]),'JPEG',76),b=enc(u8(Ls[1]),'JPEG',76),bare=enc(rgba,'PNG'),glint=enc(np.asarray(Image.fromarray(glint).resize((W//2,HP//2),Image.LANCZOS)),'PNG'))
cardm=ss(.0009,-.0009,cd) if False else 1-ss(-.0009,.0009,cd)
winm=1-ss(-.0007,.0007,wd)
def am(a):return enc(np.dstack([np.full((HP,W,3),255,'u1'),u8(a)]),'PNG')
assets=dict(card=am(cardm),win=am(winm))
ph=Image.open('/mnt/user-data/attachments/d5c528f3-de72-5ee3-8398-0c88cf384ece/494d104a-image.jpg').convert('RGB');ph=ph.resize((1200,int(1200*ph.height/ph.width)),Image.LANCZOS)
b=io.BytesIO();ph.save(b,'JPEG',quality=87,optimize=True);assets['photo']='data:image/jpeg;base64,'+base64.b64encode(b.getvalue()).decode()
for f,d in out.items():
    for k,v in d.items():assets[f'{f}_{k}']=v
print({k:round(len(v)/1024) for k,v in assets.items()})
s=open('card3.src.html').read()
for k,v in assets.items():s=s.replace(f'__{k}__',v)
open('pilot-card.html','w').write(s);print(round(len(s)/1048576,2),'MB')
