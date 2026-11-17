# Build the home page topo background (apps/web/public/topo-grafton.svg): contour lines from
# Terrarium elevation tiles (AWS Terrain Tiles, open data; USGS 3DEP in the US).
# Tiles: z12, x 1016-1021, y 1563-1567 from https://s3.amazonaws.com/elevation-tiles-prod/terrarium/12/{x}/{y}.png
# Usage: TOL=1.0 python scripts/build-topo-background.py <tiles_dir> apps/web/public/topo-grafton.svg 8 5 4.5
import sys, glob, os
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

tiles, out, step, index_every, sigma = sys.argv[1], sys.argv[2], float(sys.argv[3]), int(sys.argv[4]), float(sys.argv[5])
files = glob.glob(os.path.join(tiles, '12_*_*.png'))
xs = sorted({int(f.split('_')[-2]) for f in files}); ys = sorted({int(f.split('_')[-1][:-4]) for f in files})
dem = np.zeros((256 * len(ys), 256 * len(xs)))
for i, y in enumerate(ys):
    for j, x in enumerate(xs):
        a = np.asarray(Image.open(os.path.join(tiles, f'12_{x}_{y}.png')).convert('RGB')).astype(float)
        dem[i*256:(i+1)*256, j*256:(j+1)*256] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
print('elevation m', dem.min().round(), dem.max().round(), 'size', dem.shape)
dem = gaussian_filter(dem, sigma)
h, w = dem.shape
lo = np.ceil(dem.min() / step) * step
levels = np.arange(lo, dem.max(), step)
cs = plt.contour(dem, levels=levels)
paths = {'minor': [], 'major': []}
TOL = float(os.environ.get('TOL', '0.8'))
def rdp(pts, eps):
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]
    ab = b - a; n = np.hypot(*ab)
    if n == 0: dists = np.hypot(*(pts - a).T)
    else: dists = np.abs(ab[0] * (pts[:, 1] - a[1]) - ab[1] * (pts[:, 0] - a[0])) / n
    i = int(np.argmax(dists))
    if dists[i] > eps:
        return np.vstack([rdp(pts[:i + 1], eps)[:-1], rdp(pts[i:], eps)])
    return np.vstack([a, b])
for lvl, segs in zip(cs.levels, cs.allsegs):
    kind = 'major' if round(lvl / step) % index_every == 0 else 'minor'
    for seg in segs:
        if len(seg) < 25: continue
        seg = rdp(seg, TOL)
        pts = np.round(seg).astype(int)
        rel = np.diff(pts, axis=0)
        rel = rel[(rel != 0).any(axis=1)]
        if len(rel) < 3: continue
        d = f'M{pts[0][0]} {pts[0][1]}l' + ' '.join(f'{a} {b}' for a, b in rel)
        d = d.replace(' -', '-')
        paths[kind].append(d)
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" preserveAspectRatio="xMidYMid slice" fill="none" stroke="#000" stroke-linejoin="round" stroke-linecap="round">'
       f'<path stroke-width="0.9" d="{"".join(paths["minor"])}"/>'
       f'<path stroke-width="1.8" d="{"".join(paths["major"])}"/></svg>')
open(out, 'w').write(svg)
print('paths', len(paths['minor']), len(paths['major']), 'bytes', len(svg))
