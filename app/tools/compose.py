"""Composite captured transparent frames onto a background; output MP4 / GIF / contact sheet.

python tools/compose.py <frame dir> --mp4 out.mp4 --gif out.gif --sheet out.png --bg desk --fps 30
Backgrounds: desk (simulated desktop wallpaper + taskbar), light, dark, checker
"""
import argparse, glob, os, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import imageio_ffmpeg


def make_bg(kind, w, h, taskbar_y=None):
    if kind == 'checker':
        a = np.indices((h, w)).sum(0) // 16 % 2
        img = np.where(a[..., None] == 1, 205, 235).repeat(3, 2).astype(np.uint8)
        return Image.fromarray(img)
    if kind == 'light':
        top, bot = np.array([223, 233, 243]), np.array([185, 201, 216])
    elif kind == 'dark':
        top, bot = np.array([27, 33, 48]), np.array([12, 15, 22])
    else:  # desk: Win11-style blue wallpaper
        top, bot = np.array([58, 110, 190]), np.array([14, 30, 72])
    t = np.linspace(0, 1, h)[:, None, None]
    img = (top * (1 - t) + bot * t).repeat(w, 1).astype(np.uint8)
    im = Image.fromarray(img)
    if kind == 'desk':
        glow = Image.new('L', (w, h), 0)
        ImageDraw.Draw(glow).ellipse((-w * 0.2, -h * 0.3, w * 0.7, h * 0.8), fill=90)
        glow = glow.filter(ImageFilter.GaussianBlur(w * 0.12))
        im = Image.composite(Image.new('RGB', (w, h), (120, 170, 235)), im, glow)
    if taskbar_y is not None:
        d = ImageDraw.Draw(im, 'RGBA')
        d.rectangle((0, taskbar_y, w, h), fill=(30, 32, 40, 235))
    return im


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('frames')
    ap.add_argument('--mp4'); ap.add_argument('--gif'); ap.add_argument('--sheet')
    ap.add_argument('--bg', default='desk')
    ap.add_argument('--fps', type=int, default=30)
    ap.add_argument('--foot', type=int, default=0, help='y of the taskbar top edge in the frame (0 = no taskbar)')
    ap.add_argument('--crop', default='', help='crop to x,y,w,h')
    ap.add_argument('--gif-scale', type=float, default=0.75)
    a = ap.parse_args()
    files = sorted(glob.glob(os.path.join(a.frames, 'f_*.png')))
    first = Image.open(files[0])
    w, h = first.size
    bg = make_bg(a.bg, w, h, a.foot or None)
    out = []
    for f in files:
        im = Image.open(f).convert('RGBA')
        comp = bg.copy()
        comp.paste(im, (0, 0), im)   # frames are straight color read back from premultiplied alpha; PIL composites as straight color
        if a.crop:
            x, y, cw, ch = map(int, a.crop.split(','))
            comp = comp.crop((x, y, x + cw, y + ch))
        out.append(comp)
    W, H = out[0].size
    if a.mp4:
        ff = imageio_ffmpeg.get_ffmpeg_exe()
        p = subprocess.Popen([ff, '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(a.fps), '-i', '-',
                              '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'slow', a.mp4],
                             stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
        for im in out:
            p.stdin.write(im.tobytes())
        p.stdin.close(); p.wait()
    if a.gif:
        s = a.gif_scale
        g = [im.resize((int(W * s), int(H * s)), Image.LANCZOS) for im in out]
        g[0].save(a.gif, save_all=True, append_images=g[1:], duration=int(1000 / a.fps), loop=0, optimize=True)
    if a.sheet:
        n = min(12, len(out))
        idx = np.linspace(0, len(out) - 1, n).astype(int)
        cols = 6
        rows = (n + cols - 1) // cols
        sheet = Image.new('RGB', (W * cols, H * rows))
        for k, i in enumerate(idx):
            sheet.paste(out[i], ((k % cols) * W, (k // cols) * H))
        sheet.save(a.sheet)
    print('done', len(out), 'frames', W, 'x', H)


if __name__ == '__main__':
    main()
