# Blender: scan the open blend and list the materials used by the meshes to export, absolute texture paths and the col alpha cut-out ratio
# Usage: blender -b <skin.blend or anims.blend> --python bl_scan.py -- <out.json> <skin|props>
import bpy, sys, os
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import cfg

out, mode = sys.argv[sys.argv.index('--') + 1:][:2]


def mesh_list():
    if mode == 'skin':
        return [o for o in bpy.data.objects if o.type == 'MESH' and o.parent and o.parent.name == 'rig']
    return [o for o in bpy.data.objects if o.type == 'MESH' and o.parent and o.parent.name.startswith('rig_')]


def alpha_below(obj, mat_index, img):
    """Fraction of samples with col alpha < 0.5 inside the material's UV area (triangle centroid + three halfway points)"""
    me = obj.data
    me.calc_loop_triangles()
    uv = me.uv_layers.active.data if me.uv_layers.active else None
    if uv is None or img is None or img.size[0] == 0:
        return 0.0
    n = len(me.loop_triangles)
    loops = np.empty(n * 3, np.int32); me.loop_triangles.foreach_get('loops', loops)
    mi = np.empty(n, np.int32); me.loop_triangles.foreach_get('material_index', mi)
    uvs = np.empty(len(me.loops) * 2, np.float32); uv.foreach_get('uv', uvs)
    uvs = uvs.reshape(-1, 2)[loops].reshape(n, 3, 2)[mi == mat_index]
    if len(uvs) == 0:
        return 0.0
    c = uvs.mean(1, keepdims=True)
    pts = np.concatenate([c, (uvs + c) * 0.5], 1).reshape(-1, 2) % 1.0
    w, h = img.size
    px = np.empty(w * h * 4, np.float32); img.pixels.foreach_get(px)
    a = px.reshape(h, w, 4)[..., 3]
    x = np.clip((pts[:, 0] * w).astype(int), 0, w - 1); y = np.clip((pts[:, 1] * h).astype(int), 0, h - 1)
    return float((a[y, x] < 0.5).mean())


res = {'blend': bpy.data.filepath, 'materials': {}, 'meshes': {}}
for o in mesh_list():
    res['meshes'][o.name] = {'parent': o.parent.name, 'hidden': o.hide_render,
                             'materials': [m.name for m in o.data.materials if m], 'verts': len(o.data.vertices),
                             'uvs': [u.name for u in o.data.uv_layers]}
    for i, m in enumerate(o.data.materials):
        if m is None or not m.node_tree:
            continue
        e = res['materials'].setdefault(m.name, {'maps': {}, 'meshes': [], 'alpha_below': 0.0})
        e['meshes'].append(o.name)
        for nd in m.node_tree.nodes:
            if nd.type == 'TEX_IMAGE' and nd.image:
                p = os.path.normpath(bpy.path.abspath(nd.image.filepath, library=nd.image.library))
                e['maps'][nd.name] = p.replace('\\', '/')
        col = next((nd.image for nd in m.node_tree.nodes if nd.type == 'TEX_IMAGE' and nd.name == 'col' and nd.image), None)
        e['alpha_below'] = max(e['alpha_below'], alpha_below(o, i, col))
cfg.save_json(out, res)
print('SCAN', len(res['meshes']), 'meshes', len(res['materials']), 'materials ->', out)
