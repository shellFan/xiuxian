from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image


path = Path(__file__).resolve().parents[1] / "assets/textures/ui/home/home-character.png"
image = Image.open(path).convert("RGBA")
pixels = np.array(image)
rgb = pixels[:, :, :3].astype(np.int16)

# The supplied cutout has a visible grey checkerboard baked into the RGB data.
# Flood only neutral, mid-light pixels from the image border so white clothing
# and paper details inside the cutout are not removed.
neutral = rgb.max(axis=2) - rgb.min(axis=2) <= 10
mid_light = (rgb.min(axis=2) >= 145) & (rgb.max(axis=2) <= 235)
candidate = neutral & mid_light
height, width = candidate.shape
visited = np.zeros_like(candidate, dtype=bool)
queue = deque()

for x in range(width):
    if candidate[0, x]:
        visited[0, x] = True
        queue.append((0, x))
    if candidate[height - 1, x] and not visited[height - 1, x]:
        visited[height - 1, x] = True
        queue.append((height - 1, x))
for y in range(height):
    if candidate[y, 0] and not visited[y, 0]:
        visited[y, 0] = True
        queue.append((y, 0))
    if candidate[y, width - 1] and not visited[y, width - 1]:
        visited[y, width - 1] = True
        queue.append((y, width - 1))

while queue:
    y, x = queue.popleft()
    for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
        if 0 <= ny < height and 0 <= nx < width and candidate[ny, nx] and not visited[ny, nx]:
            visited[ny, nx] = True
            queue.append((ny, nx))

pixels[visited, 3] = 0
Image.fromarray(pixels, "RGBA").save(path)
print(f"cleaned {path} ({int(visited.sum())} background pixels)")
