"""Generate an original goose GLB and Blender source with headless Blender."""
import bpy
import math
from pathlib import Path

out = Path(__file__).resolve().parents[2] / "build" / "goose"
out.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

def mat(name, color):
    m=bpy.data.materials.new(name)
    m.diffuse_color=(*color,1)
    return m

white=mat("Ivory feathers",(0.91,0.89,0.79))
wing=mat("Wing feathers",(0.76,0.75,0.68))
orange=mat("Orange beak and feet",(0.94,0.36,0.08))
black=mat("Eyes",(0.01,0.014,0.02))
teeth=mat("Teeth",(1,0.98,0.87))

def ball(name,loc,scale,material):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,location=loc)
    o=bpy.context.object
    o.name=name
    o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(material)
    return o

ball("Body",(0,0,1.18),(.69,.95,.53),white)
ball("Chest",(0,.55,1.25),(.53,.48,.46),white)
ball("Neck",(0,.59,1.85),(.22,.22,.68),white)
ball("Head",(0,.66,2.46),(.36,.35,.35),white)
ball("Upper beak",(0,1.10,2.34),(.27,.46,.12),orange)
ball("Lower beak",(0,1.10,2.19),(.24,.40,.075),orange)
for side in (-1,1):
    ball("Eye",(.285*side,.85,2.51),(.07,.075,.08),black)
    ball("Wing",(.61*side,-.1,1.31),(.17,.63,.27),wing)
    for i in range(3):
        ball("Feather",((.63+.035*i)*side,-.32-.16*i,1.23),(.12,.29,.14),white)
    ball("Leg",(.36*side,.12,.48),(.09,.09,.32),orange)
    ball("Webbed foot",(.36*side,.31,.2),(.23,.34,.075),orange)
for i in range(5):
    bpy.ops.mesh.primitive_cone_add(vertices=6,radius1=.04,radius2=0,depth=.11,location=((i-2)*.095,1.34,2.24))
    bpy.context.object.name="Little tooth"
    bpy.context.object.data.materials.append(teeth)
for i in range(3):
    ball("Tail feather",((i-1)*.17,-.84,1.47),(.17,.37,.15),white)

bpy.ops.wm.save_as_mainfile(filepath=str(out/"goose-with-teeth-v01.blend"))
bpy.ops.export_scene.gltf(filepath=str(out/"goose-with-teeth-v01.glb"),export_format="GLB",export_apply=True)
print("Exported",out)
