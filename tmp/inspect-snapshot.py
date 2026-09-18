import json
from collections import Counter

MANIFEST = r'C:\Users\Fan\.zcode\v2\checkpoints\19a577f5966b\manifests\5ef4f0adc5d795297389990dda88f1baf025762a488a9bd25a419a3b404a0e91.json'
EXTRA = r'C:\Users\Fan\.zcode\v2\checkpoints\19a577f5966b\extra-manifests\6ce75ef94654cab7304a6d9e6f6f7fd703505bedb03cd185ad013ea2c29c0fc1.json'

with open(MANIFEST, encoding='utf-8') as f:
    data = json.load(f)

print('stats:', json.dumps(data['stats']))
files = data['files']
print('sample entry:', json.dumps(files[0], ensure_ascii=False))
print()

cnt = Counter()
byt = Counter()
for f in files:
    p = (f.get('path') or f.get('p') or '').replace('\\', '/')
    top = p.split('/')[0]
    cnt[top] += 1
    byt[top] += f.get('size') or f.get('s') or 0

print('=== file count by top-level dir (top 25) ===')
for k, v in cnt.most_common(25):
    print(f'{v:6d}  {k}')
print()
print('=== bytes by top-level dir (top 25) ===')
for k, v in byt.most_common(25):
    print(f'{v:>12,}  {k}')
print()
print('total files:', len(files), 'total bytes:', sum(byt.values()))
print()

# .git breakdown
gcnt = Counter()
gbyt = Counter()
for f in files:
    p = (f.get('path') or f.get('p') or '').replace('\\', '/')
    if p.startswith('.git/'):
        sub = p.split('/')[1]
        gcnt[sub] += 1
        gbyt[sub] += f.get('size') or 0
print('=== .git breakdown ===')
for k in set(gcnt) | set(gbyt):
    print(f'{gcnt[k]:6d} files  {gbyt[k]:>12,} bytes  .git/{k}')
print()

# sensitive-ish files
sens = ('secret', 'credential', 'token', 'key', 'password', '.env', 'private')
print('=== potentially sensitive files included ===')
for f in files:
    p = (f.get('path') or '').replace('\\', '/')
    lp = p.lower()
    if any(s in lp for s in sens):
        print(f"{f.get('size', 0):>10,}  {p}")

print()
print('=== extra manifest (global configs) ===')
with open(EXTRA, encoding='utf-8') as f:
    extra = json.load(f)
print(json.dumps(extra, ensure_ascii=False, indent=2)[:3000])
