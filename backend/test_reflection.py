from simulation.environment import create_default_environment
from propagation.reflection import compute_reflection_paths
from propagation.occlusion import has_line_of_sight

env = create_default_environment()
bs = env["base_station"]
rx = env["receiver"]
buildings = env["buildings"]

print(f"BS: ({bs.x}, {bs.y})")
print(f"RX: ({rx.x}, {rx.y})")
print(f"Direct LOS BS->RX: {has_line_of_sight(bs.x, bs.y, rx.x, rx.y, buildings)}")
print(f"\nComputing reflection paths...")

paths = compute_reflection_paths(bs.x, bs.y, rx.x, rx.y, buildings)
print(f"Valid reflection paths found: {len(paths)}")
for p in paths:
    print(f"  Building {p['building_id']}: reflection at ({p['reflection_x']:.1f}, {p['reflection_y']:.1f}), total path={p['total_path_length']:.1f}")
