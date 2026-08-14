from typing import List, Dict, Any
from shapely.geometry import Polygon, LineString


def building_to_polygon(building: Any) -> Polygon:
    """Convert a Building dataclass (x, y, width, height) into a Shapely Polygon."""
    corners = [
        (building.x, building.y),
        (building.x + building.width, building.y),
        (building.x + building.width, building.y + building.height),
        (building.x, building.y + building.height),
    ]
    return Polygon(corners)


def has_line_of_sight(
    from_x: float, from_y: float, to_x: float, to_y: float, buildings: List[Any]
) -> bool:
    """Check if Line-of-Sight exists between two 2D points without building occlusion."""
    line = LineString([(from_x, from_y), (to_x, to_y)])

    for building in buildings:
        poly = building_to_polygon(building).buffer(-1e-3)
        if line.intersects(poly):
            return False

    return True


def get_los_status(
    bs_x: float,
    bs_y: float,
    warden_x: float,
    warden_y: float,
    rx_x: float,
    rx_y: float,
    buildings: List[Any],
) -> Dict[str, bool]:
    """Compute Line-of-Sight status for both Warden and Receiver relative to Base Station."""
    bs_to_warden_los = has_line_of_sight(bs_x, bs_y, warden_x, warden_y, buildings)
    bs_to_rx_los = has_line_of_sight(bs_x, bs_y, rx_x, rx_y, buildings)

    return {
        "bs_to_warden_los": bs_to_warden_los,
        "bs_to_rx_los": bs_to_rx_los,
        "warden_blocked": not bs_to_warden_los,
        "rx_blocked": not bs_to_rx_los,
    }
