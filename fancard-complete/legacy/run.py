import re,base64,sys,io,json
from PIL import Image
s=open('/mnt/user-data/uploads/Tinsel_Queen_Photocard__1_.html').read()
m=re.search(r'const PHOTO="(data:[^"]+)",MASK="(data:[^"]+)"',s)
for n,u in zip(('photo','mask'),m.groups()):
    b=base64.b64decode(u.split(',')[1]);im=Image.open(io.BytesIO(b));print(n,im.size,im.format,len(b))
