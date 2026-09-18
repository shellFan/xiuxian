import json
from collections import Counter

MANIFEST = r'C:\Users\Fan\.zcode\v2\checkpoints\19a577f5966b\manifests\5ef4f0adc5d795297389990dda88f1baf025762a488a9bd25a419a3b404a0e91.json'

with open(MANIFEST, encoding='utf-8') as f:
    data = json.load(f)
files = data['files']

cnt = Counter()
byt = Counter()
for f in files:
    p = (f.get('path') or '').replace('\\', '/')
    top = p.split('/')[0]
    cnt[top] += 1
    byt[top] += f.get('sizeBytes') or 0

print('=== bytes by top-level dir ===')
for k, v in byt.most_common(30):
    print(f'{v:>12,}  {cnt[k]:5d} files  {k}')
print()
print('total bytes:', f'{sum(byt.values()):,}')

gbyt = Counter()
for f in files:
    p = (f.get('path') or '').replace('\\', '/')
    if p.startswith('.git/'):
        gbyt[p.split('/')[1]] += f.get('sizeBytes') or 0
print()
print('=== .git bytes breakdown ===')
gt = sum(gbyt.values())
for k, v in gbyt.most_common():
    pct = v / gt * 100 if gt else 0
    print(f'{v:>12,}  {pct:5.1f}%  .git/{k}')
print(f'.git total {gt:,} / {sum(byt.values()):,} = {gt/sum(byt.values())*100:.1f}%')

# largest non-git files
print()
print('=== 20 largest non-.git files ===')
ng = sorted((f for f in files if not (f.get('path') or '').startswith('.git')), key=lambda x: -x.get('sizeBytes', 0))[:20]
for f in ng:
    print(f"{f.get('sizeBytes'):>12,}  {f['path']}")
