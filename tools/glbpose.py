# Read a glb directly, without any importer, and compute node world positions at a given time (glTF coordinates, Y up)
# python glbpose.py <clip.glb> <t_seconds> [node name ...]    (uncompressed glb only)
import sys, struct, json
import numpy as np
from glbinfo import read_glb

CT = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8, 5122: np.int16, 5120: np.int8}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def accessor(g, b, i):
    a = g['accessors'][i]; bv = g['bufferViews'][a['bufferView']]
    off = 12 + 8 + struct.unpack_from('<I', b, 12)[0] + 8 + bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    n = NC[a['type']]
    return np.frombuffer(b, CT[a['componentType']], a['count'] * n, off).reshape(a['count'], n)


def quat_mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def pose(path, t, anim=0):
    g, b = read_glb(path)
    nodes = g['nodes']
    trs = [{'translation': np.array(n.get('translation', [0, 0, 0]), float), 'rotation': np.array(n.get('rotation', [0, 0, 0, 1]), float),
            'scale': np.array(n.get('scale', [1, 1, 1]), float)} for n in nodes]
    if g.get('animations'):
        A = g['animations'][anim]
        for ch in A['channels']:
            s = A['samplers'][ch['sampler']]
            ti = accessor(g, b, s['input'])[:, 0]; vo = accessor(g, b, s['output'])
            k = int(np.clip(np.searchsorted(ti, t, 'right') - 1, 0, len(ti) - 1))
            trs[ch['target']['node']][ch['target']['path']] = vo[k].astype(float)
    parent = {c: i for i, n in enumerate(nodes) for c in n.get('children', [])}
    W = {}

    def world(i):
        if i in W:
            return W[i]
        m = np.eye(4)
        m[:3, :3] = quat_mat(trs[i]['rotation']) * trs[i]['scale']
        m[:3, 3] = trs[i]['translation']
        W[i] = (world(parent[i]) @ m) if i in parent else m
        return W[i]
    return {n.get('name'): world(i) for i, n in enumerate(nodes)}


if __name__ == '__main__':
    P = pose(sys.argv[1], float(sys.argv[2]))
    for n in sys.argv[3:]:
        print(n, np.round(P[n][:3, 3], 4))
