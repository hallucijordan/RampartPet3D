# Paths and conventions: imported by both system Python and Blender's bundled Python
import json
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
REPO = TOOLS.parent                                       # repo root
if not (REPO / 'assets.json').exists():
    raise FileNotFoundError(f'Missing {REPO / "assets.json"}: copy tools/assets.example.json to assets.json at the repo root and edit the paths')
_A = json.loads((REPO / 'assets.json').read_text(encoding='utf-8'))
ASSET_ROOT = Path(_A['asset_root'])
BLENDER = _A['blender']
MODELS = ASSET_ROOT / 'models'
ANIMS_DIR = MODELS / 'anims'
ANIMS_BLEND = ANIMS_DIR / 'rampart_base_anims.blend'   # built on the base-skin rig (with ponytail and coat-tail keyframes, last frames restored); the older rampart_hp_anims.blend is kept as a fallback
WORK = ASSET_ROOT / 'work' / 'pet3d'                     # intermediates (converted textures, uncompressed glb, verification renders)
APP_ASSETS = REPO / 'app' / 'assets'                     # outputs the runtime reads (gitignored)
GLTF_TEX = WORK / 'gltf_tex'                              # baseColor / normal / ORM for the glb files
RAW_CLIPS = WORK / 'clips_raw'                            # uncompressed clip glb straight out of Blender

SKINS = {
    'base': {'blend': MODELS / 'blend' / 'rampart_base.blend', 'out': 'rampart.glb'},
    'hp': {'blend': MODELS / 'blend' / 'rampart_hp.blend', 'out': 'rampart_hp.glb'},
    'rebecca': {'blend': MODELS / 'blend' / 'rampart_rebecca.blend', 'out': 'rampart_rebecca.glb'},   # collab skin icon_v25_clockup
    'bear': {'blend': MODELS / 'blend' / 'rampart_bear.blend', 'out': 'rampart_bear.glb'},            # Bear-iccade lgnd_v24_cosmictechno: bear head mask, no facial bones
}
# Meshes are renamed to skin-independent names so the runtime can toggle them by name (e.g. hide the Sheila on her back when the prop Sheila appears)
MESH_ROLES = ['body', 'head', 'hair', 'gear', 'sheila', 'eye_cornea', 'eye_shadow']

INCH = 0.0254          # game units = inches
FPS = 30

# Prop model name -> short name (bone prefix "<short>__"; Blender bone names are limited to 63 characters)
PROP_SHORT = {
    'rampart_bubblegum': 'bubblegum',
    'rampart_gum': 'gum',
    'rampart_turret_lobby': 'turret_lobby',
    'rampart_turret': 'turret',
    'w_rampart_turret': 'sheila_w',
    'w_rampart_wall_held': 'wall_held',
    'rampart_cover_wall': 'cover_wall',
    'heirloom_rampart_v21_wrench_gladcard': 'wrench_card',
    'heirloom_rampart_v21_wrench_w': 'wrench_w',
    'bullets_v02_all': 'bullets',
    'smear': 'smear',
    'katana_01_w': 'katana',
    'lifeline_drone': 'drone',
    'welder': 'welder',
    'cricket_bat_01': 'cricket_bat',
    'loot_bin_01_loba_gladcard': 'lootbin',
    'droppod_loot_animated_rampart': 'droppod',
}


# Prop variants: short name -> (model, materials to drop). turret_gun = the lobby Sheila with only the gun body (tripod meshes removed),
# for clips where she carries Sheila and the tripod has no animation of its own (decided by bl_clips.tripod_mode)
PROP_VARIANTS = {
    'turret_gun': ('rampart_turret_lobby', ['rampart_turret_base']),
}


def prop_short(model):
    return PROP_SHORT.get(model, model.replace('rampart_', '')[:20])


def clip_id(action_name):
    return action_name.replace('/', '__').replace('#', '_p')


def load_json(p, default=None):
    p = Path(p)
    if not p.exists():
        return default
    return json.loads(p.read_text(encoding='utf-8'))


def save_json(p, obj):
    p = Path(p)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding='utf-8')
