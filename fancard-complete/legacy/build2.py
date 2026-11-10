from PIL import Image;import base64,io
im=Image.open('/mnt/user-data/attachments/d5c528f3-de72-5ee3-8398-0c88cf384ece/494d104a-image.jpg').convert('RGB')
im=im.resize((1200,int(1200*im.height/im.width)),Image.LANCZOS);print(im.size);b=io.BytesIO();im.save(b,'JPEG',quality=86,optimize=True)
s=open('card2.src.html').read().replace('__PHOTO__','data:image/jpeg;base64,'+base64.b64encode(b.getvalue()).decode())
open('pilot-card.html','w').write(s)
