import json, sys, numpy as np
from PIL import Image
ref = np.load('reference.npy'); refs = ref.reshape(160,4,240,4,3).mean(axis=(1,3))
def tm(x, e=0.7):
    x=x*e; x=np.clip((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0,1)
    return np.where(x<=0.0031308,12.92*x,1.055*np.power(x,1/2.4)-0.055)
rm = refs.reshape(-1,3).mean(0)
for n in map(int, sys.argv[1:]):
    a=np.array(json.load(open(f'acc_{n}.json')),dtype=np.float32).reshape(160,240,4)
    img=a[...,:3]/a[...,3:4]; m=img.reshape(-1,3).mean(0)
    print(n, 'mean ratio', (m/rm).round(3), 'display RMSE', round(float(np.sqrt(((tm(img)-tm(refs))**2).mean())),4))
    last=img
# where is the bias? ratio per region
r = (last.mean(2)+1e-3)/(refs.mean(2)+1e-3)
print('median per-pixel ratio', np.median(r).round(3))
Image.fromarray((np.concatenate([tm(last),tm(refs)],1)*255).astype(np.uint8)).resize((960,320)).save('side_by_side.png')
