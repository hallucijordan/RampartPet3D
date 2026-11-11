# Inspect a glb's JSON chunk: overview of nodes, meshes, materials, images, animation channels
# python glbinfo.py <file.glb> [--nodes]
import json, struct, sys


def read_glb(path):
    b = open(path, 'rb').read()
    magic, ver, length = struct.unpack_from('<III', b, 0)
    assert magic == 0x46546C67
    clen, ctype = struct.unpack_from('<II', b, 12)
    return json.loads(b[20:20 + clen]), b


def summary(path, show_nodes=False):
    g, b = read_glb(path)
    print(path, f'{len(b) / 1e6:.2f} MB', 'extUsed', g.get('extensionsUsed'), 'extReq', g.get('extensionsRequired'))
    nodes = g.get('nodes', [])
    print('nodes', len(nodes), 'meshes', len(g.get('meshes', [])), 'skins', len(g.get('skins', [])),
          'materials', len(g.get('materials', [])), 'images', len(g.get('images', [])))
    roots = g['scenes'][g.get('scene', 0)]['nodes']
    print('scene roots', [nodes[i].get('name') for i in roots])
    for s in g.get('skins', []):
        print('skin joints', len(s['joints']))
    for m in g.get('meshes', []):
        attrs = sorted(m['primitives'][0]['attributes'])
        print('mesh', m.get('name'), 'prims', len(m['primitives']), attrs)
    for m in g.get('materials', []):
        pbr = m.get('pbrMetallicRoughness', {})
        print('mat', m.get('name'), m.get('alphaMode', 'OPAQUE'), m.get('alphaCutoff'), 'double' if m.get('doubleSided') else 'single',
              'base' if 'baseColorTexture' in pbr else '-', 'mr' if 'metallicRoughnessTexture' in pbr else '-',
              'nrm' if 'normalTexture' in m else '-', 'occ' if 'occlusionTexture' in m else '-', 'emit' if 'emissiveTexture' in m else '-',
              'mf', pbr.get('metallicFactor'), 'rf', pbr.get('roughnessFactor'))
    for i, im in enumerate(g.get('images', [])):
        bv = g['bufferViews'][im['bufferView']] if 'bufferView' in im else None
        print('image', i, im.get('name'), im.get('mimeType'), f"{bv['byteLength'] / 1e6:.2f} MB" if bv else im.get('uri'))
    for a in g.get('animations', []):
        acc = g['accessors']
        tmax = max(acc[s['input']].get('max', [0])[0] for s in a['samplers'])
        paths = {}
        for c in a['channels']:
            paths[c['target']['path']] = paths.get(c['target']['path'], 0) + 1
        tgt = {c['target'].get('node') for c in a['channels']}
        print('anim', a.get('name'), 'channels', len(a['channels']), paths, 'nodes targeted', len(tgt), 'duration', round(tmax, 4))
    if show_nodes:
        for i, n in enumerate(nodes):
            print(i, n.get('name'), 'children', len(n.get('children', [])), 'mesh' if 'mesh' in n else '', 'skin' if 'skin' in n else '')
    return g


if __name__ == '__main__':
    summary(sys.argv[1], '--nodes' in sys.argv)
