# glb post-processing (patches the binary in place, structure unchanged):
#   replaces zero-length tangents that MikkTSpace produces at degenerate UVs with a unit vector perpendicular to the normal (otherwise normalize(0) in the shader gives NaN black spots)
# python glbfix.py <file.glb> ...
import sys, struct
import numpy as np
from glbinfo import read_glb


def fix_tangents(path):
    g, b = read_glb(path)
    b = bytearray(b)
    bin_off = 20 + struct.unpack_from('<I', b, 12)[0] + 8
    view = lambda i: (g['bufferViews'][g['accessors'][i]['bufferView']], g['accessors'][i])
    fixed = 0
    for m in g.get('meshes', []):
        for p in m['primitives']:
            at = p['attributes']
            if 'TANGENT' not in at or 'NORMAL' not in at:
                continue
            (bvt, at_), (bvn, an) = view(at['TANGENT']), view(at['NORMAL'])
            ot = bin_off + bvt.get('byteOffset', 0) + at_.get('byteOffset', 0)
            on = bin_off + bvn.get('byteOffset', 0) + an.get('byteOffset', 0)
            st, sn = bvt.get('byteStride', 16), bvn.get('byteStride', 12)
            assert st == 16 and sn == 12
            t = np.frombuffer(b, np.float32, at_['count'] * 4, ot).reshape(-1, 4).copy()
            n = np.frombuffer(b, np.float32, an['count'] * 3, on).reshape(-1, 3)
            bad = np.linalg.norm(t[:, :3], axis=1) < 1e-6
            if not bad.any():
                continue
            nn = n[bad]
            ref = np.where(np.abs(nn[:, 1:2]) < 0.9, [[0, 1, 0]], [[1, 0, 0]])
            tt = np.cross(ref, nn)
            tt /= np.linalg.norm(tt, axis=1, keepdims=True) + 1e-12
            t[bad, :3] = tt; t[bad, 3] = 1.0
            b[ot:ot + t.nbytes] = t.astype(np.float32).tobytes()
            fixed += int(bad.sum())
    if fixed:
        open(path, 'wb').write(bytes(b))
    print('glbfix', path, 'zero-length tangents fixed:', fixed)
    return fixed


if __name__ == '__main__':
    for p in sys.argv[1:]:
        fix_tangents(p)
