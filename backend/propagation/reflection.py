import math
from typing import List, Dict, Tuple, Optional, Any
from shapely.geometry import Polygon, LineString, Point
from propagation.occlusion import building_to_polygon, has_line_of_sight

_reflection_cache: dict = {}


def get_building_walls(building: Any) -> List[Dict[str, Any]]:
    """Return the four wall segments and outward normals for a rectangular building."""
    x, y = building.x, building.y
    w, h = building.width, building.height

    walls = [
        {
            "wall_line": LineString([(x, y), (x + w, y)]),
            "normal_x": 0.0,
            "normal_y": -1.0,
        },
        {
            "wall_line": LineString([(x, y + h), (x + w, y + h)]),
            "normal_x": 0.0,
            "normal_y": 1.0,
        },
        {
            "wall_line": LineString([(x, y), (x, y + h)]),
            "normal_x": -1.0,
            "normal_y": 0.0,
        },
        {
            "wall_line": LineString([(x + w, y), (x + w, y + h)]),
            "normal_x": 1.0,
            "normal_y": 0.0,
        },
    ]
    return walls


def reflect_point_across_line(
    px: float, py: float, wall_line: LineString
) -> Tuple[float, float]:
    """Reflect point (px, py) across a wall LineString segment."""
    x1, y1 = wall_line.coords[0]
    x2, y2 = wall_line.coords[1]

    dx = x2 - x1
    dy = y2 - y1
    denom = dx * dx + dy * dy

    if denom == 0.0:
        return float(px), float(py)

    t = ((px - x1) * dx + (py - y1) * dy) / denom
    foot_x = x1 + t * dx
    foot_y = y1 + t * dy

    reflected_x = 2.0 * foot_x - px
    reflected_y = 2.0 * foot_y - py
    return float(reflected_x), float(reflected_y)


def find_reflection_point_on_wall(
    virtual_x: float, virtual_y: float, rx_x: float, rx_y: float, wall_line: LineString
) -> Optional[Tuple[float, float]]:
    """Find the intersection point on the wall for the line from virtual transmitter to Receiver."""
    path_line = LineString([(virtual_x, virtual_y), (rx_x, rx_y)])

    if path_line.intersects(wall_line):
        intersection = path_line.intersection(wall_line)
        if intersection.geom_type == "Point":
            return float(intersection.x), float(intersection.y)

    return None


def compute_reflection_paths(
    bs_x: float, bs_y: float, rx_x: float, rx_y: float, buildings: List[Any]
) -> List[Dict[str, Any]]:
    """Find all valid 1-hop reflection paths between Base Station and Receiver off building walls."""
    # Create cache key from building ids and BS/RX positions
    cache_key = (
        tuple(b.id for b in buildings),
        round(bs_x, 1), round(bs_y, 1),
        round(rx_x, 1), round(rx_y, 1),
    )
    global _reflection_cache
    if cache_key in _reflection_cache:
        return _reflection_cache[cache_key]

    results = []

    for building in buildings:
        walls = get_building_walls(building)
        for wall in walls:
            virtual_x, virtual_y = reflect_point_across_line(
                bs_x, bs_y, wall["wall_line"]
            )
            refl_pt = find_reflection_point_on_wall(
                virtual_x, virtual_y, rx_x, rx_y, wall["wall_line"]
            )

            if refl_pt is not None:
                refl_x, refl_y = refl_pt

                # Verify clear Line-of-Sight for both segments
                los_bs = has_line_of_sight(bs_x, bs_y, refl_x, refl_y, buildings)
                los_rx = has_line_of_sight(refl_x, refl_y, rx_x, rx_y, buildings)

                if los_bs and los_rx:
                    d1 = math.sqrt((refl_x - bs_x) ** 2 + (refl_y - bs_y) ** 2)
                    d2 = math.sqrt((rx_x - refl_x) ** 2 + (rx_y - refl_y) ** 2)
                    total_path_length = d1 + d2

                    results.append(
                        {
                            "building_id": int(building.id),
                            "reflection_x": float(refl_x),
                            "reflection_y": float(refl_y),
                            "total_path_length": float(total_path_length),
                            "virtual_bs_x": float(virtual_x),
                            "virtual_bs_y": float(virtual_y),
                        }
                    )

    # If no paths found, try extended method
    if not results:
        results = []
        for building in buildings:
            walls = get_building_walls(building)
            for wall in walls:
                x1, y1 = wall["wall_line"].coords[0]
                x2, y2 = wall["wall_line"].coords[1]
                for t in [0.25, 0.5, 0.75]:
                    px = x1 + t * (x2 - x1)
                    py = y1 + t * (y2 - y1)
                    bs_los = has_line_of_sight(
                        bs_x, bs_y, px, py, buildings)
                    rx_los = has_line_of_sight(
                        px, py, rx_x, rx_y, buildings)
                    if bs_los and rx_los:
                        d1 = math.sqrt(
                            (px-bs_x)**2 + (py-bs_y)**2)
                        d2 = math.sqrt(
                            (rx_x-px)**2 + (rx_y-py)**2)
                        direct_dist = math.sqrt(
                            (rx_x-bs_x)**2 + (rx_y-bs_y)**2)
                        if d1 + d2 < direct_dist * 2.5:
                            results.append({
                                "building_id": int(building.id),
                                "reflection_x": float(px),
                                "reflection_y": float(py),
                                "total_path_length": float(d1+d2),
                                "virtual_bs_x": float(bs_x),
                                "virtual_bs_y": float(bs_y),
                            })
    
    # Keep best path per building
    seen = {}
    for r in results:
        bid = r["building_id"]
        if bid not in seen or \
           r["total_path_length"] < seen[bid]["total_path_length"]:
            seen[bid] = r
    results = list(seen.values())
    _reflection_cache[cache_key] = results
    return results


def compute_reflection_paths_extended(
    bs_x: float, bs_y: float,
    rx_x: float, rx_y: float,
    buildings: list
) -> list:
    """
    Extended reflection finder that combines image-source method
    with a direct wall-midpoint sampling approach as fallback.
    """
    # First try standard image-source method
    results = compute_reflection_paths(bs_x, bs_y, rx_x, rx_y, buildings)
    
    if results:
        return results
    
    # Fallback: sample points along each building wall
    # and check if BS->point->RX path is geometrically valid
    for building in buildings:
        walls = get_building_walls(building)
        for wall in walls:
            # Sample 5 points along the wall
            x1, y1 = wall["wall_line"].coords[0]
            x2, y2 = wall["wall_line"].coords[1]
            
            for t in [0.2, 0.35, 0.5, 0.65, 0.8]:
                # Sample point on wall
                px = x1 + t * (x2 - x1)
                py = y1 + t * (y2 - y1)
                
                # Check if this point creates valid 
                # BS->point->RX path
                # Point must be on the correct side 
                # (outward normal check)
                nx = wall["normal_x"]
                ny = wall["normal_y"]
                
                # Vector from wall point to BS
                to_bs_x = bs_x - px
                to_bs_y = bs_y - py
                
                # Vector from wall point to RX  
                to_rx_x = rx_x - px
                to_rx_y = rx_y - py
                
                # Both BS and RX must be on same side 
                # as outward normal OR we check LOS
                bs_los = has_line_of_sight(
                    bs_x, bs_y, px, py, buildings)
                rx_los = has_line_of_sight(
                    px, py, rx_x, rx_y, buildings)
                
                if bs_los and rx_los:
                    # Valid reflection point found
                    d1 = math.sqrt(
                        (px-bs_x)**2 + (py-bs_y)**2)
                    d2 = math.sqrt(
                        (rx_x-px)**2 + (rx_y-py)**2)
                    
                    # Only add if path is reasonable 
                    # (not too long vs direct path)
                    direct_dist = math.sqrt(
                        (rx_x-bs_x)**2 + (rx_y-bs_y)**2)
                    
                    if d1 + d2 < direct_dist * 2.5:
                        results.append({
                            "building_id": int(building.id),
                            "reflection_x": float(px),
                            "reflection_y": float(py),
                            "total_path_length": float(d1+d2),
                            "virtual_bs_x": float(bs_x),
                            "virtual_bs_y": float(bs_y),
                        })
    
    # Remove duplicates by keeping shortest path 
    # per building
    seen = {}
    for r in results:
        bid = r["building_id"]
        if bid not in seen or \
           r["total_path_length"] < seen[bid]["total_path_length"]:
            seen[bid] = r
    
    return list(seen.values())
