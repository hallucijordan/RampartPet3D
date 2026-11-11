# Composes the transparent sequences from render_clips.py: light gray background + ground line + time labels -> contact sheet PNG + low frame rate MP4
# Usage: python compose_clips.py <frames root> <output dir> [clip_id ...]
# Output: <output dir>/<clip_id>.png (12-16 tiles), <clip_id>.mp4; clips over 12 s also get <clip_id>_timeline.png (one tile per second)
import json, os, sys, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

ROOT, OUT = sys.argv[1], sys.argv[2]
ONLY = set(sys.argv[3:])
os.makedirs(OUT, exist_ok=True)
BG = (206, 207, 209)
FONT = ImageFont.truetype('arial.ttf', 13)
FONT_B = ImageFont.truetype('arialbd.ttf', 15)
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def tile(path, cam, f, scale=1.0):
    im = Image.open(path).convert('RGBA')
    base = Image.new('RGBA', im.size, BG + (255,))
    d = ImageDraw.Draw(base)
    gx, gy = cam['ground_px']
    d.ellipse([gx - 70, gy - 9, gx + 70, gy + 9], outline=(170, 171, 174), width=2)
    base.alpha_composite(im)
    d = ImageDraw.Draw(base)
    d.text((5, 3), f"{(f - cam['start']) / cam['fps']:.2f}s", fill=(60, 60, 60), font=FONT)
    base = base.convert('RGB')
    if scale != 1.0:
        base = base.resize((int(base.width * scale) // 2 * 2, int(base.height * scale) // 2 * 2), Image.LANCZOS)
    return base


def sheet(tiles, cols, title):
    w, h = tiles[0].size
    rows = (len(tiles) + cols - 1) // cols
    im = Image.new('RGB', (w * min(cols, len(tiles)), h * rows + 24), (245, 245, 245))
    d = ImageDraw.Draw(im)
    d.text((6, 4), title, fill=(20, 20, 20), font=FONT_B)
    for i, t in enumerate(tiles):
        im.paste(t, ((i % cols) * w, 24 + (i // cols) * h))
    return im


for cid in sorted(os.listdir(ROOT)):
    if ONLY and cid not in ONLY:
        continue
    d = os.path.join(ROOT, cid)
    cj = os.path.join(d, 'cam.json')
    if not os.path.exists(cj) or (os.path.exists(os.path.join(OUT, cid + '.png')) and not ONLY):
        continue
    cam = json.load(open(cj))
    frames = cam['frames']
    paths = [os.path.join(d, f'f_{f:04d}.png') for f in frames]
    dur = (frames[-1] - cam['start']) / cam['fps']
    title = f"{cid}   {dur:.2f}s"
    n = 16 if len(frames) >= 16 and dur > 4 else min(12, len(frames))
    pick = [int(round(i * (len(frames) - 1) / max(n - 1, 1))) for i in range(n)]
    tiles = [tile(paths[i], cam, frames[i]) for i in pick]
    sheet(tiles, 8, title).save(os.path.join(OUT, cid + '.png'), optimize=True)
    if dur > 12:  # long clips: one tile per second, for finding sub-clips
        step = max(1, int(round(len(frames) / dur)))
        tl = [tile(paths[i], cam, frames[i], 0.5) for i in range(0, len(frames), step)]
        sheet(tl, 14, title + '   (1 frame / s)').save(os.path.join(OUT, cid + '_timeline.png'), optimize=True)
    if len(frames) > 1:
        out_fps = cam['fps'] / max(1, frames[1] - frames[0])
        w, h = Image.open(paths[0]).size
        p = subprocess.Popen([FFMPEG, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{w}x{h}',
                              '-r', f'{out_fps:.3f}', '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23',
                              os.path.join(OUT, cid + '.mp4')], stdin=subprocess.PIPE)
        for f, pth in zip(frames, paths):
            p.stdin.write(np.asarray(tile(pth, cam, f)).tobytes())
        p.stdin.close(); p.wait()
    print('C', cid, len(frames), flush=True)
