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

def hexc(h):return np.array([int(h[k:k+2],16)/255 for k in(1,3,5)],'f4')
STOPS=[(0,'#e2a236'),(7,'#ff9a52'),(15,'#ff4d8f'),(23,'#a24dff'),(31,'#3f7dff'),(39,'#2fdcc4'),(48,'#d9a233')]
sp=np.array([p/48 for p,_ in STOPS],'f4');sc=np.stack([hexc(c) for _,c in STOPS])
def tint(s):
    u=(X*.848+Y*.53)/2.165+.656+s*.175;u=u-np.floor(u)
    return np.stack([np.interp(u,sp,sc[:,k]) for k in range(3)],-1).astype('f4')
def band(cen,w,dirx=.927,diry=.375):
    v=X*dirx+Y*diry;return np.exp(-((v-cen)/w)**2)
ph=Image.open('/mnt/user-data/attachments/d5c528f3-de72-5ee3-8398-0c88cf384ece/494d104a-image.jpg').convert('RGB')
pw=int(1.01*W);phh=int(pw*ph.height/ph.width);phi=np.asarray(ph.resize((pw,phh),Image.LANCZOS)).astype('f4')/255
photo=np.zeros((HP,W,3),'f4');ox=int(-.06*W);oy=int(.0259*W)
y0,y1=max(oy,0),min(oy+phh,HP);x0,x1=max(ox,0),min(ox+pw,W)
photo[y0:y1,x0:x1]=phi[y0-oy:y1-oy,x0-ox:x1-ox]
winm=(1-ss(-.0007,.0007,wd))[...,None]
cardm=1-ss(-.0009,.0009,cd)
STATES=(-1.,0.,1.)
assets={}
b0=io.BytesIO();ph.convert('RGB').resize((1300,int(1300*ph.height/ph.width)),Image.LANCZOS).save(b0,'JPEG',quality=88,optimize=True);assets['photo']='data:image/jpeg;base64,'+base64.b64encode(b0.getvalue()).decode()
for face in('front','back'):
    text=mask(face)
    h,t,groove=relief(text)
    if face=='back':
        wings=mask('wings');num=mask('num');wh=G(wings,1.6);nW=normals(wh,.016)
        shadow=G(np.roll(np.roll(wings,10,axis=0),4,axis=1),7);A,R,rn=perlage()
    nx,ny,nz=normals(h,.0115);cut=ss(.01,.09,1-nz)
    env0=studio(nx,ny,0,0);silver=.42+env0*.68
    alpha=np.clip(cut*(wd>-.002),0,1);tedge=np.clip(text,0,1);txtenv=.92
    rgb=silver*(1-tedge)+txtenv*tedge;alpha=np.maximum(alpha,tedge)
    a=np.stack([rgb]*3,-1)
    if face=='back':
        wn=studio(nW[0],nW[1]+br*.02,0,0);ws=.46+wn*.72;wa=np.clip(wings,0,1)
        a=a*(1-wa[...,None])+ws[...,None]*wa[...,None];alpha=np.maximum(alpha,wa)
        nm=G(num,.5);a=a*(1-nm[...,None])+np.array([.09,.06,.07],'f4')*nm[...,None]
    rim=ss(-.0035,0,cd);a=a*(1-rim[...,None]*.72);alpha=np.maximum(alpha,rim*.95)
    if face=='front':
        sh=ss(-.02,0,wd)*(wd<=0);a=a*(1-(sh>alpha)[...,None]);alpha=np.maximum(alpha,sh*.42)
    gm=np.clip(cut*(wd>-.002),0,1)
    if face=='back':gm=np.maximum(gm,np.clip(G(wings,1)-G(wings,4)*.75,0,1))
    for si,s in enumerate(STATES):
        tx,ty=s*.65,-s*.22
        env=studio(nx,ny+br*.038,tx,ty);L=(.3+env*.72)*(1+br*.035)
        if face=='back':
            la=1.1+tx*1.15-ty*.6
            cone=np.abs(np.cos(A-la))**5+.45*np.abs(np.cos(A-la+1.3))**12
            pl=.14+.62*cone*(.82+.18*R)+rn*.022
            pl=pl*(.62+.38*(1-ss(.93,1.,R)))*(1-.62*ss(-.032,0,wd))*(1-.68*shadow)
            L=np.where(wd<0,pl,L)
        L=L*(1-.62*G(np.roll(np.roll(text,2,axis=0),2,axis=1),1.6))
        c=np.clip(L,0,1)[...,None]*tint(s)
        sa=(band(.95+s*.5,.17)*.8)[...,None]
        c=c*(1-sa)+np.where(c<.5,2*c,1.)*sa
        c=c*(1-alpha[...,None])+a*alpha[...,None]
        if face=='front':
            wm=winm[...,0];A2=(1-wm)+wm*alpha
            c=((1-wm)[...,None]*c+(wm*alpha)[...,None]*a)/np.maximum(A2,1e-4)[...,None]
        else:A2=np.ones_like(alpha)
        g=(band(1.0+s*.75,.06)*gm)[...,None];c=c*(1-g)+g
        rgba=np.dstack([u8(c),u8(cardm*A2)])
        b=io.BytesIO();Image.fromarray(rgba,'RGBA').save(b,'WEBP',quality=90,method=6,alpha_quality=100)
        assets[f'{face}{si}']='data:image/webp;base64,'+base64.b64encode(b.getvalue()).decode()
        if face=='front' and si==1:Image.fromarray(rgba,'RGBA').save('out/bake_front.png')
print({k:round(len(v)/1024) for k,v in assets.items()})
s=open('card4.src.html').read()
for k,v in assets.items():s=s.replace(f'__{k}__',v)
open('pilot-card.html','w').write(s);print(round(len(s)/1048576,2),'MB')
