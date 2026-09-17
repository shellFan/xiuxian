"""Extract only static illustrations; all game data and controls remain live nodes."""
import json
import uuid
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
source = Path(r'C:\Users\Fan\AppData\Local\Temp\codex-clipboard-4d6048d0-4cd4-40b4-bb7a-2c430308b1e7.png')
im = Image.open(source)
dest = root / 'assets/textures/ui/home'
template = json.loads((dest / 'home-office-background.png.meta').read_text())
crops = {
    'reference-brand': (22, 8, 482, 136),
    'reference-office': (22, 357, 487, 576),
    'reference-avatar': (42, 137, 117, 214),
    'reference-home': (52, 850, 96, 886),
    'reference-tasks': (142, 850, 190, 886),
    'reference-craft': (234, 850, 284, 886),
    'reference-promotion': (324, 850, 373, 886),
    'reference-more': (420, 851, 463, 885),
    'reference-cultivation': (49, 244, 77, 273),
    'reference-salary': (160, 244, 188, 273),
    'reference-performance': (268, 244, 296, 273),
    'reference-mind': (380, 244, 408, 273),
}
manifest = {}
for name, box in crops.items():
    crop = im.crop(box)
    crop.save(dest / (name + '.png'))
    ident = str(uuid.uuid5(uuid.NAMESPACE_URL, 'xiuxian/home/' + name))
    meta = json.loads(json.dumps(template).replace(template['uuid'], ident))
    meta['subMetas']['6c48a']['displayName'] = name
    sf = meta['subMetas']['f9941']
    sf['displayName'] = name
    data = sf['userData']
    data.pop('vertices', None)
    data.update(width=crop.width, height=crop.height, rawWidth=crop.width, rawHeight=crop.height, trimType='none')
    (dest / (name + '.png.meta')).write_text(json.dumps(meta, indent=2), encoding='utf-8')
    manifest[name] = ident + '@f9941'
(dest / 'reference-manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print('Extracted', len(crops), 'static reference assets')
