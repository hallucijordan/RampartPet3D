"""Demo video compositing: transparent full-page frames + simulated desktop + cursor + captions -> MP4

python tools/compose_demo.py <frame dir> <out.mp4> --crop x,y,w,h --captions captions.json --fps 30
captions.json: [[start_s, end_s, "caption"], ...]
Cursor positions are read from log.json in the frame dir (the [mx, my, down] that capture.js records)
"""
import argparse, glob, json, os, subprocess
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg
from compose import make_bg

FONT = 'C:/Windows/Fonts/msyhbd.ttc'   # Windows system font (Microsoft YaHei Bold, covers CJK as well as Latin)


def cursor_img(down):
    # Draw a plain arrow cursor (slightly smaller and greyer while pressed)
    s = 26
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pts = [(1, 1), (1, 20), (6, 15), (10, 23), (13, 22), (9, 14), (16, 14)]
    d.polygon(pts, fill=(255, 255, 255, 255) if not down else (220, 220, 220, 255), outline=(0, 0, 0, 255))
    if down:
        im = im.resize((22, 22), Image.LANCZOS)
    return im


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('frames'); ap.add_argument('out')
    ap.add_argument('--crop', default='')
    ap.add_argument('--captions', default='')
    ap.add_argument('--fps', type=int, default=30)
    ap.add_argument('--taskbar', type=int, default=48)
    a = ap.parse_args()
    files = sorted(glob.glob(os.path.join(a.frames, 'f_*.png')))
    log = json.load(open(os.path.join(a.frames, 'log.json')))
    log = [e for e in log if e[0] >= 0]
    caps = json.load(open(a.captions, encoding='utf-8')) if a.captions else []
    W, H = Image.open(files[0]).size
    bg = make_bg('desk', W, H, H - a.taskbar)
    font = ImageFont.truetype(FONT, 30)
    cur_up, cur_down = cursor_img(False), cursor_img(True)
    cx, cy, cw, ch = map(int, a.crop.split(',')) if a.crop else (0, 0, W, H)
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    p = subprocess.Popen([ff, '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{cw}x{ch}', '-r', str(a.fps), '-i', '-',
                          '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17', '-preset', 'slow', a.out],
                         stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
    for i, f in enumerate(files):
        im = Image.open(f).convert('RGBA')
        comp = bg.copy().convert('RGBA')
        comp.alpha_composite(im)
        if i < len(log) and isinstance(log[i][5], list):
            mx, my, down = log[i][5]
            if -100 < mx < W + 100 and -100 < my < H + 100:
                c = cur_down if down else cur_up
                comp.alpha_composite(c, (int(mx), int(my)))
        comp = comp.crop((cx, cy, cx + cw, cy + ch))
        t = i / a.fps
        text = next((c[2] for c in caps if c[0] <= t < c[1]), '')
        if text:
            d = ImageDraw.Draw(comp)
            tw = d.textlength(text, font=font)
            x, y = (cw - tw) / 2, ch - a.taskbar - 70
            d.rounded_rectangle((x - 18, y - 10, x + tw + 18, y + 44), 12, fill=(12, 16, 28, 190))
            d.text((x, y), text, font=font, fill=(255, 244, 228, 255))
        p.stdin.write(comp.convert('RGB').tobytes())
    p.stdin.close(); p.wait()
    print('done', len(files), 'frames ->', a.out)


if __name__ == '__main__':
    main()
