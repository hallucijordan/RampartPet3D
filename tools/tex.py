# System Python (Pillow + numpy): game spec-gloss textures -> glTF metal-rough textures; also dumps the raw textures for the custom shaders
# Called by build.py; can also run standalone: python tex.py <scan.json> [--max 2048]
import sys, argparse
import numpy as np
from PIL import Image
import cfg

MASK_THRESHOLD = 0.0005   # if the fraction of alpha<0.5 samples in the material's UV area exceeds this -> alphaMode MASK
CAVITY_MIX = 0.4          # baseColor *= lerp(1, cav, CAVITY_MIX)
DIELECTRIC = 0.04
FORCE_MASK = ('hair',)    # materials whose names contain these always use MASK
BLEND_MATS = ('eyeshadow', 'eyecornea')
# These map names feed the glTF conversion; the rest (thk/sctr/asd/msk/tnt/ilm...) are only dumped as is
CORE = ('col', 'nml', 'gls', 'spc', 'ao', 'cav')


def srgb2lin(x):
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)


def lin2srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def load(path, size):
    im = Image.open(path).convert('RGBA')
    if im.size != (size, size):
        im = im.resize((size, size), Image.LANCZOS)
    return np.asarray(im, np.float32) / 255.0


def normal_gl(rg):
    """BC5 two channels -> full OpenGL normal (the game uses DirectX: G down, so flip G), rebuild B"""
    x = rg[..., 0] * 2 - 1
    y = -(rg[..., 1] * 2 - 1)
    z = np.sqrt(np.clip(1 - x * x - y * y, 0, 1))
    n = np.stack([x, y, z], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True) + 1e-8
    return n * 0.5 + 0.5


def pbr_convert(diff_srgb, spec_srgb):
    """Standard KHR spec-gloss -> metal-rough conversion (linear space); returns (linear baseColor, metallic)"""
    d = srgb2lin(diff_srgb); s = srgb2lin(spec_srgb)
    pb = lambda c: np.sqrt(0.299 * c[..., 0] ** 2 + 0.587 * c[..., 1] ** 2 + 0.114 * c[..., 2] ** 2)
    one_minus = 1 - s.max(-1)
    pd, ps = pb(d), pb(s)
    a = DIELECTRIC
    b = pd * one_minus / (1 - a) + ps - 2 * a
    c = a - ps
    m = np.clip((-b + np.sqrt(np.maximum(b * b - 4 * a * c, 0))) / (2 * a), 0, 1)
    m = np.where(ps < a, 0.0, m)
    eps = 1e-4
    from_d = d * (one_minus / (1 - a) / np.maximum(1 - m, eps))[..., None]
    from_s = (s - a * (1 - m)[..., None]) / np.maximum(m, eps)[..., None]
    t = (m * m)[..., None]
    base = np.clip(from_d * (1 - t) + from_s * t, 0, 1)
    return base, m


def save(arr01, path, mode, jpeg=False):
    a = np.clip(arr01 * 255 + 0.5, 0, 255).astype(np.uint8)
    im = Image.fromarray(a, mode)
    path.parent.mkdir(parents=True, exist_ok=True)
    if jpeg:
        im.save(path, 'JPEG', quality=92, subsampling=0, optimize=True)
    else:
        im.save(path, 'PNG', optimize=False, compress_level=6)
    return path


def is_gray(a):
    return np.abs(a[..., 0] - a[..., 1]).max() < 0.02 and np.abs(a[..., 0] - a[..., 2]).max() < 0.02


def alpha_mode(name, entry):
    low = name.lower()
    if any(k in low for k in BLEND_MATS):
        return 'BLEND'
    if any(k in low for k in FORCE_MASK) or entry.get('alpha_below', 0) > MASK_THRESHOLD:
        return 'MASK'
    return 'OPAQUE'


def convert_material(name, entry, max_size, force=False):
    """Writes GLTF_TEX/<mat>_{base,nml,orm,emit}.*; returns the description Blender uses"""
    maps = entry['maps']
    if 'col' not in maps:
        return None
    size = min(max(Image.open(maps['col']).size), max_size)
    mode = alpha_mode(name, entry)
    out = {'alpha_mode': mode, 'size': size, 'files': {}}
    tgt = lambda k, ext: cfg.GLTF_TEX / f'{name}_{k}.{ext}'
    base_p = tgt('base', 'jpg' if mode == 'OPAQUE' else 'png')
    stamp = cfg.GLTF_TEX / f'{name}.done'
    col = None
    if force or not stamp.exists():
        col = load(maps['col'], size)
        spc = load(maps['spc'], size)[..., :3] if 'spc' in maps else np.full(col.shape[:2] + (3,), 0.22, np.float32)
        base, metal = pbr_convert(col[..., :3], spc)
        if 'cav' in maps:
            cav = load(maps['cav'], size)[..., :1]
            base = base * (1 - CAVITY_MIX + CAVITY_MIX * cav)
        base = lin2srgb(base)
        if mode == 'OPAQUE':
            save(base, base_p, 'RGB', jpeg=True)
        else:
            save(np.concatenate([base, col[..., 3:4]], -1), base_p, 'RGBA')
        if 'nml' in maps:
            save(normal_gl(load(maps['nml'], size)), tgt('nml', 'png'), 'RGB')
        rough = 1 - load(maps['gls'], size)[..., 0] if 'gls' in maps else np.full(col.shape[:2], 0.6, np.float32)
        rough = np.clip(rough, 0.04, 1)
        ao = load(maps['ao'], size)[..., 0] if 'ao' in maps else np.ones(col.shape[:2], np.float32)
        save(np.stack([ao, rough, metal], -1), tgt('orm', 'jpg'), 'RGB', jpeg=True)
        if 'ilm' in maps:
            save(load(maps['ilm'], size)[..., :3], tgt('emit', 'jpg'), 'RGB', jpeg=True)
        stamp.write_text('ok')
    out['files']['base'] = str(base_p)
    for k, ext in (('nml', 'png'), ('orm', 'jpg'), ('emit', 'jpg')):
        if tgt(k, ext).exists():
            out['files'][k] = str(tgt(k, ext))
    out['has_ao'] = 'ao' in maps
    return out


def dump_raw(name, entry, max_size, index, force=False):
    """Dump raw textures to app/assets/tex/<mat>_<map>.png (never upscaled, at most max_size; nml has B rebuilt and is converted to OpenGL)"""
    d = cfg.APP_ASSETS / 'tex'
    rec = index.setdefault(name, {'maps': {}, 'meshes': entry['meshes'], 'alpha_mode': alpha_mode(name, entry)})
    rec['meshes'] = sorted(set(rec['meshes']) | set(entry['meshes']))
    for k, src in sorted(entry['maps'].items()):
        # Skip map groups that belong to another material (e.g. base_* inside rampart_turret)
        if '_' in k and k.split('_')[-1] in CORE + ('ilm', 'msk') and not k[0].isdigit():
            continue
        p = d / f'{name}_{k}.png'
        im = Image.open(src)
        size = min(max(im.size), max_size)
        if force or not p.exists():
            a = load(src, size)
            if k == 'nml' or k.endswith('_nml'):
                save(normal_gl(a), p, 'RGB')
            elif is_gray(a[..., :3]) and a[..., 3].min() > 0.99:
                save(a[..., 0], p, 'L')
            elif a[..., 3].min() > 0.99:
                save(a[..., :3], p, 'RGB')
            else:
                save(a, p, 'RGBA')
        rec['maps'][k] = {'file': f'tex/{p.name}', 'size': size, 'src_size': list(im.size)}
        if k == 'nml':
            rec['maps'][k]['note'] = 'OpenGL (+Y): G flipped, B rebuilt'
    return rec


def run(scan_path, max_size=2048, dump=True, only=None, force=False):
    scan = cfg.load_json(scan_path)
    idx_p = cfg.APP_ASSETS / 'tex' / 'index.json'
    index = cfg.load_json(idx_p, {}) if dump else None
    result = {}
    for name, e in scan['materials'].items():
        if only and name not in only:
            continue
        r = convert_material(name, e, max_size, force)
        if r:
            result[name] = r
            if dump:
                dump_raw(name, e, max_size, index, force)
        print('TEX', name, r and r['alpha_mode'], flush=True)
    if dump:
        index['_conventions'] = {
            'nml': 'OpenGL convention (+Y up); the game originals are DirectX two-channel, G flipped and B rebuilt as z=sqrt(1-x²-y²)',
            'col': 'sRGB albedo (the diffuse of the spec-gloss workflow), alpha = cut-out mask',
            'spc': 'sRGB specular color (F0), dielectrics about 0.22 sRGB ≈ 0.04 linear',
            'gls': 'linear glossiness; in the glb roughness = 1 - gls',
            'ao/cav': 'linear grayscale; in the glb cav is multiplied into baseColor at 0.4 strength, ao goes to occlusion',
            'thk/sctr': 'skin subsurface thickness / scattering (not in the glb)',
            'asd/msk': 'hair anisotropy / mask (not in the glb)',
            'size': 'never upscaled: sources smaller than 2048 keep their size',
        }
        cfg.save_json(idx_p, index)
    return result


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('scan'); ap.add_argument('--max', type=int, default=2048)
    ap.add_argument('--force', action='store_true')
    a = ap.parse_args()
    run(a.scan, a.max, force=a.force)
