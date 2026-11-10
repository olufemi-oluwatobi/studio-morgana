import json, base64, sys
from PIL import Image
import io
S = json.load(open(sys.argv[2] if len(sys.argv)>2 else 'scene.json'))
ref = Image.open('reference.png').convert('RGB'); b = io.BytesIO(); ref.save(b, 'JPEG', quality=92)
html = open('tracer.html').read().replace('__SCENE__', json.dumps(S)).replace('__REF__', 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode())
open(sys.argv[1] if len(sys.argv) > 1 else 'index.html', 'w').write(html)
print('ok', len(html))
