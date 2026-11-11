# Blender: export a skin model or prop model as glb (no animation, meters, +Y up, materials converted to glTF metal-rough)
# Usage:
#   blender -b <skin.blend> --python bl_model.py -- skin <tex.json> <out.glb> [--eyes]
#   blender -b <anims.blend> --python bl_model.py -- prop <tex.json> <out_dir> <model> [<model> ...]
import bpy, sys, os
from mathutils import Matrix
sys.path.insert(0, os.path.dirname(__file__))
import cfg
from io_scene_gltf2.blender.com.material_helpers import create_settings_group, get_gltf_node_name

args = sys.argv[sys.argv.index('--') + 1:]
MODE, TEX = args[0], cfg.load_json(args[1])
bpy.context.preferences.edit.use_global_undo = False


def img(path, non_color):
    im = bpy.data.images.load(path, check_existing=True)
    im.colorspace_settings.name = 'Non-Color' if non_color else 'sRGB'
    im.alpha_mode = 'STRAIGHT'
    return im


def cornea_material(mat):
    """Cornea: in the game this is a dedicated refractive highlight shader; here it becomes a nearly transparent black glossy shell that only contributes highlights"""
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    bsdf.inputs['Base Color'].default_value = (0, 0, 0, 1)
    bsdf.inputs['Alpha'].default_value = 0.15
    bsdf.inputs['Roughness'].default_value = 0.03
    bsdf.inputs['Metallic'].default_value = 0.0
    mat.surface_render_method = 'BLENDED'
    mat.use_backface_culling = True


def build_material(mat):
    """Rebuild the nodes from tex.py's outputs: base -> base color (+alpha), nml -> normal, ORM -> AO / roughness / metallic, emit -> emission"""
    if 'eyecornea' in mat.name:
        return cornea_material(mat)
    t = TEX.get(mat.name)
    if t is None:
        print('NO TEX for', mat.name); return
    f = t['files']
    nt = mat.node_tree
    nt.nodes.clear()
    L = nt.links.new
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    L(bsdf.outputs['BSDF'], out.inputs['Surface'])
    base = nt.nodes.new('ShaderNodeTexImage'); base.image = img(f['base'], False)
    L(base.outputs['Color'], bsdf.inputs['Base Color'])
    mode = t['alpha_mode']
    if mode == 'MASK':
        lt = nt.nodes.new('ShaderNodeMath'); lt.operation = 'LESS_THAN'; lt.inputs[1].default_value = 0.5
        sub = nt.nodes.new('ShaderNodeMath'); sub.operation = 'SUBTRACT'; sub.inputs[0].default_value = 1.0
        L(base.outputs['Alpha'], lt.inputs[0]); L(lt.outputs[0], sub.inputs[1]); L(sub.outputs[0], bsdf.inputs['Alpha'])
    elif mode == 'BLEND':
        L(base.outputs['Alpha'], bsdf.inputs['Alpha'])
    if 'nml' in f:
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = img(f['nml'], True)
        nm = nt.nodes.new('ShaderNodeNormalMap')
        L(n.outputs['Color'], nm.inputs['Color']); L(nm.outputs['Normal'], bsdf.inputs['Normal'])
    orm = nt.nodes.new('ShaderNodeTexImage'); orm.image = img(f['orm'], True)
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    L(orm.outputs['Color'], sep.inputs['Color'])
    L(sep.outputs['Green'], bsdf.inputs['Roughness']); L(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    if t.get('has_ao'):
        g = bpy.data.node_groups.get(get_gltf_node_name()) or create_settings_group(get_gltf_node_name())
        gn = nt.nodes.new('ShaderNodeGroup'); gn.node_tree = g
        L(sep.outputs['Red'], gn.inputs['Occlusion'])
    if 'emit' in f:
        e = nt.nodes.new('ShaderNodeTexImage'); e.image = img(f['emit'], False)
        L(e.outputs['Color'], bsdf.inputs['Emission Color']); bsdf.inputs['Emission Strength'].default_value = 1.0
    mat.surface_render_method = 'BLENDED' if mode == 'BLEND' else 'DITHERED'
    mat.use_backface_culling = mode == 'OPAQUE'


def keep_first_uv(me):
    for uv in list(me.uv_layers)[1:]:
        me.uv_layers.remove(uv)


def export(path, objs, **kw):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.hide_set(False); o.hide_viewport = False; o.hide_render = False
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
        export_animations=False, export_skins=True, export_def_bones=False, export_leaf_bone=False,
        export_rest_position_armature=True, export_tangents=True, export_normals=True, export_texcoords=True,
        export_materials='EXPORT', export_image_format='AUTO', export_morph=False, export_extras=False,
        export_attributes=False, export_cameras=False, export_lights=False, **kw)
    print('EXPORTED', path, os.path.getsize(path))


def reset_pose(rig):
    if rig.animation_data:
        rig.animation_data.action = None
    for pb in rig.pose.bones:
        pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.rotation_euler = (0, 0, 0); pb.scale = (1, 1, 1)


if MODE == 'skin':
    out = args[2]
    eyes = '--eyes' in args
    rig = bpy.data.objects['rig']
    reset_pose(rig)
    meshes = []
    for o in [o for o in bpy.data.objects if o.type == 'MESH' and o.parent == rig]:
        role = o.name.split('_', 2)[2].replace('acc_', '')          # rampart_base_acc_gear → gear
        if role.startswith('eye_') and not eyes:
            bpy.data.objects.remove(o); continue
        o.name = role; o.data.name = role
        keep_first_uv(o.data)
        meshes.append(o)
    for m in {m for o in meshes for m in o.data.materials if m}:
        build_material(m)
    export(out, [rig] + meshes)

elif MODE == 'prop':
    # Names can be model names or variant short names (cfg.PROP_VARIANTS: same skeleton, some meshes removed); each model's skeleton is processed once
    out_dir, jobs = args[2], {}
    for nm in args[3:]:
        model, drop = cfg.PROP_VARIANTS.get(nm, (nm, []))
        jobs.setdefault(model, []).append((nm if nm in cfg.PROP_VARIANTS else cfg.prop_short(nm), drop))
    for model, outs in jobs.items():
        arm = bpy.data.objects['rig_' + model]
        kids = [o for o in arm.children if o.type == 'MESH']
        for c in list(arm.constraints):
            arm.constraints.remove(c)
        if arm.animation_data:
            arm.animation_data.action = None
            for t in list(arm.animation_data.nla_tracks):
                arm.animation_data.nla_tracks.remove(t)
        reset_pose(arm)
        # Inches -> meters: scale the armature and mesh data directly, reset the object transforms
        S = Matrix.Scale(cfg.INCH, 4)
        arm.matrix_world = Matrix.Identity(4)
        arm.data.transform(S)
        for o in kids:
            o.matrix_parent_inverse = Matrix.Identity(4); o.matrix_basis = Matrix.Identity(4)
            o.data.transform(S)
            keep_first_uv(o.data)
        for m in {m for o in kids for m in o.data.materials if m}:
            build_material(m)
        names = {b: b.name for b in arm.data.bones}
        for short, drop in outs:
            for b in arm.data.bones:
                b.name = f'{short}__{names[b]}'
            arm.name = f'{short}__rig'
            keep = [o for o in kids if not any(m and m.name in drop for m in o.data.materials)]
            for i, o in enumerate(keep):
                o.name = f'{short}__mesh' + (f'_{i}' if i else '')
            export(os.path.join(out_dir, f'{short}.glb'), [arm] + keep)
