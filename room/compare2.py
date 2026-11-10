import json, sys, numpy as np
from PIL import Image
ref = np.load('reference.npy'); refs = ref.reshape(160,4,240,4,3).mean(axis=(1,3))
def tm(x, e=0.7):
    x=x*e; x=np.clip((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0,1)
    return np.where(x<=0.0031308,12.92*x,1.055*np.power(x,1/2.4)-0.055)
def load(f): return np.array(json.load(open(f)),dtype=np.float32).reshape(160,240,4)
# guide albedo needed to remodulate the denoised buffer: rebuild from raw/denoised ratio is not possible, so read the guide dump
G = np.array(json.load(open('guide.json')),dtype=np.float32).reshape(160,240,3,4)
alb = G[:,:,1,:3]
rows=[]
for n in map(int, sys.argv[1:]):
    a=load(f'acc_{n}.json'); raw=a[...,:3]/a[...,3:4]
    dn=load(f'acc_dn_{n}.json')[...,:3]*alb
    e=lambda x: float(np.sqrt(((tm(x)-tm(refs))**2).mean()))
    print(f'{n:5d} spp  raw RMSE {e(raw):.4f}   denoised RMSE {e(dn):.4f}   denoised mean ratio {(dn.reshape(-1,3).mean(0)/refs.reshape(-1,3).mean(0)).round(3)}')
    rows.append(np.concatenate([tm(raw),tm(dn),tm(refs)],1))
Image.fromarray((np.concatenate(rows,0)*255).astype(np.uint8)).resize((1440, 320*len(rows))).save('grid.png')
