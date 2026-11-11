# One frame from each S/A clip, tiled into an overview: <preview dir>/_overview_SA.png
# Usage: python overview.py <frames root> <output png>
import json, os, sys
from PIL import Image, ImageDraw, ImageFont
ROOT, OUT = sys.argv[1], sys.argv[2]
HERE = os.path.dirname(os.path.abspath(__file__))
rows = json.load(open(os.path.join(HERE, '..', 'clips.json'), encoding='utf-8'))
PICK = {'emote__rampart_ground_emote_chillaxing_loop': 1.7, 'lobby__rampart_menu_lobby_select_idle': 2.0, 'move__rampart_idle_ua': 7.0,
        'lobby__rampart_menu_lobby_center_idle_weld': 11.0, 'emote__rampart_ground_emote_bollywood_dance': 10.6,
        'emote__rampart_ground_emote_boombox': 5.0, 'emote__rampart_ground_emote_taunt': 1.0, 'melee__rampart_ziplineidle_wrench': 4.5,
        'lobby__rampart_menu_lobby_center_idle_gunrev': 4.5, 'emote__goldenhorse_rampart_celebration': 3.0,
        'emote__rampart_ground_emote_chillaxing': 2.2, 'gladcard__rampart_gladcard_animated_fixing': 1.6,
        'lobby__rampart_igc_mythic_weapon_teaser': 9.3, 'emote__rampart_ground_emote_yoga': 1.0, 'move__rampart_crouch_ua': 9.0,
        'emote__rampart_ground_emote_mechbull': 3.2, 'emote__rampart_freefall_emote_backflip': 1.2}
F = ImageFont.truetype('arial.ttf', 12)
tiles = []
for r in rows:
    if r['tier'] not in 'SA':
        continue
    cid = r['clip_id'] + ('_head' if r['category'] == 'quest' else '')
    cj = os.path.join(ROOT, cid, 'cam.json')
    if not os.path.exists(cj):
        continue
    cam = json.load(open(cj))
    t = PICK.get(r['clip_id'], r['duration_s'] / 2)
    f = min(cam['frames'], key=lambda x: abs((x - cam['start']) / cam['fps'] - t))
    im = Image.open(os.path.join(ROOT, cid, f'f_{f:04d}.png')).convert('RGBA')
    im = im.resize((int(im.width * 240 / im.height), 240))
    bg = Image.new('RGBA', (220, 260), (206, 207, 209, 255))
    x = (220 - im.width) // 2
    bg.alpha_composite(im.crop((max(0, -x), 0, max(0, -x) + min(220, im.width), 240)), (max(0, x), 20))
    d = ImageDraw.Draw(bg)
    d.text((3, 2), f"{r['tier']} {r['clip_id'].split('__')[1].replace('rampart_', '')[:30]}", fill=(0, 0, 0), font=F)
    tiles.append(bg.convert('RGB'))
cols = 10
out = Image.new('RGB', (220 * cols, 260 * ((len(tiles) + cols - 1) // cols)), 'white')
for i, t in enumerate(tiles):
    out.paste(t, ((i % cols) * 220, (i // cols) * 260))
out.save(OUT, optimize=True)
print(len(tiles), OUT)
