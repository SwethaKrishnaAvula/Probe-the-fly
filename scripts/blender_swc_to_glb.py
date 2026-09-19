"""Run inside Blender to convert the configured SWC neurons into one GLB."""

import bpy
import json
from pathlib import Path


def find_project_dir():
    """Find the project from the script opened in Blender's Text Editor."""
    candidates = []

    # Blender keeps the real path here when the script was opened from disk.
    text = getattr(getattr(bpy.context, "space_data", None), "text", None)
    if text and text.filepath:
        script_path = Path(bpy.path.abspath(text.filepath)).resolve()
        candidates.append(script_path.parent.parent)

    # These fallbacks help when Blender is launched from or saved in the project.
    if bpy.data.filepath:
        candidates.append(Path(bpy.data.filepath).resolve().parent)
    candidates.append(Path.cwd().resolve())

    for candidate in candidates:
        if (candidate / "00_CENTRAL_PROJECT.md").exists():
            return candidate

    raise FileNotFoundError(
        "Could not find the steel-hacks project. Open this script from its "
        "scripts folder, then run it again."
    )


PROJECT_DIR = find_project_dir()
GEOMETRY_DIR = PROJECT_DIR / "game_data" / "geometry"
CONFIG_PATH = GEOMETRY_DIR / "blender_export_config.json"


def load_config():
    """Load the path-specific settings written by 06_export_skeletons.py."""
    if not CONFIG_PATH.exists():
        raise FileNotFoundError(
            f"Missing {CONFIG_PATH}. Run 06_export_skeletons.py first."
        )

    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    required = {"body_ids", "swc_files", "colors", "output_glb"}
    missing = required - set(config)
    if missing:
        raise RuntimeError(f"Blender config is missing: {sorted(missing)}")

    return config


def read_swc(path):
    """Read SWC rows into a dictionary keyed by node ID."""
    nodes = {}

    with path.open("r", encoding="utf-8") as swc_file:
        for line in swc_file:
            line = line.strip()
            if not line or line.startswith("#"):
                continue

            parts = line.split()
            if len(parts) < 7:
                continue

            node_id = int(parts[0])
            nodes[node_id] = {
                "x": float(parts[2]),
                "y": float(parts[3]),
                "z": float(parts[4]),
                "radius": float(parts[5]),
                "parent": int(parts[6]),
            }

    if not nodes:
        raise RuntimeError(f"No SWC nodes were read from {path}")

    return nodes


def shared_transform(all_neurons, target_size):
    """Calculate one center and scale for all configured neurons together."""
    points = [
        (node["x"], node["y"], node["z"])
        for nodes in all_neurons.values()
        for node in nodes.values()
    ]

    minimum = [min(point[axis] for point in points) for axis in range(3)]
    maximum = [max(point[axis] for point in points) for axis in range(3)]
    center = [(minimum[axis] + maximum[axis]) / 2 for axis in range(3)]
    largest_side = max(maximum[axis] - minimum[axis] for axis in range(3))

    if largest_side == 0:
        raise RuntimeError("The SWC coordinates have no visible size.")

    scale = target_size / largest_side
    return center, scale


def transform_point(node, center, scale):
    """Center and scale one SWC point."""
    return (
        (node["x"] - center[0]) * scale,
        (node["y"] - center[1]) * scale,
        (node["z"] - center[2]) * scale,
    )


def branch_paths(nodes):
    """Join simple chains into splines instead of making one object per edge."""
    children = {node_id: [] for node_id in nodes}

    for node_id, node in nodes.items():
        parent_id = node["parent"]
        if parent_id in children:
            children[parent_id].append(node_id)

    paths = []

    # Start at roots and branch points so every parent-child edge is included.
    starts = [
        node_id
        for node_id, node in nodes.items()
        if node["parent"] not in nodes or len(children[node_id]) != 1
    ]

    for start_id in starts:
        for child_id in children[start_id]:
            path = [start_id, child_id]
            current_id = child_id

            while len(children[current_id]) == 1:
                current_id = children[current_id][0]
                path.append(current_id)

            paths.append(path)

    return paths


def make_material(name, color):
    """Create one simple material for a neuron."""
    material = bpy.data.materials.new(name=f"material_{name}")
    material.diffuse_color = color
    return material


def make_neuron_object(body_id, nodes, center, scale, color, tube_radius):
    """Create one Blender curve object from an SWC neuron."""
    curve = bpy.data.curves.new(name=f"neuron_{body_id}", type="CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 1
    curve.bevel_depth = tube_radius
    curve.bevel_resolution = 0
    curve.resolution_u = 1
    curve.use_fill_caps = True

    for path in branch_paths(nodes):
        spline = curve.splines.new(type="POLY")
        spline.points.add(len(path) - 1)

        for point, node_id in zip(spline.points, path):
            x, y, z = transform_point(nodes[node_id], center, scale)
            point.co = (x, y, z, 1.0)

    neuron_object = bpy.data.objects.new(body_id, curve)
    bpy.context.collection.objects.link(neuron_object)
    neuron_object.data.materials.append(make_material(body_id, color))
    return neuron_object


def clear_scene():
    """Remove the default cube, camera, light, and any other scene objects."""
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def convert_to_mesh(neuron_object):
    """Convert a curve to a mesh so it exports reliably to GLB."""
    bpy.ops.object.select_all(action="DESELECT")
    neuron_object.select_set(True)
    bpy.context.view_layer.objects.active = neuron_object
    bpy.ops.object.convert(target="MESH")
    neuron_object.name = neuron_object.name.split(".")[0]


def export_glb(neuron_objects, output_glb):
    """Export only the configured neuron objects."""
    output_glb.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")

    for neuron_object in neuron_objects:
        neuron_object.select_set(True)

    bpy.context.view_layer.objects.active = neuron_objects[0]
    bpy.ops.export_scene.gltf(
        filepath=str(output_glb),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_animations=False,
    )


def main():
    config = load_config()
    body_ids = [str(body_id) for body_id in config["body_ids"]]
    swc_files = {
        body_id: GEOMETRY_DIR / config["swc_files"][body_id]
        for body_id in body_ids
    }
    colors = {
        body_id: tuple(config["colors"][body_id])
        for body_id in body_ids
    }
    output_glb = GEOMETRY_DIR / config["output_glb"]
    target_size = float(config.get("target_size", 20.0))
    tube_radius = float(config.get("tube_radius", 0.025))

    for path in swc_files.values():
        if not path.exists():
            raise FileNotFoundError(f"Missing SWC file: {path}")

    neurons = {
        body_id: read_swc(path)
        for body_id, path in swc_files.items()
    }
    center, scale = shared_transform(neurons, target_size)

    clear_scene()
    neuron_objects = [
        make_neuron_object(
            body_id,
            nodes,
            center,
            scale,
            colors[body_id],
            tube_radius,
        )
        for body_id, nodes in neurons.items()
    ]

    for neuron_object in neuron_objects:
        convert_to_mesh(neuron_object)

    export_glb(neuron_objects, output_glb)
    print(f"Exported GLB to: {output_glb}")


main()
