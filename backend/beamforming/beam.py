import math
from dataclasses import dataclass


@dataclass
class BeamConfig:
    direction: float  # Angle in degrees (0-360), direction beam is pointing
    width: float  # Beamwidth in degrees
    max_gain: float = 10.0  # Maximum gain at boresight (in dB)


def compute_angle(from_x: float, from_y: float, to_x: float, to_y: float) -> float:
    """Compute angle in degrees [0, 360] from source point (from_x, from_y) to target point (to_x, to_y)."""
    dx = to_x - from_x
    dy = to_y - from_y
    angle_rad = math.atan2(dy, dx)
    angle_deg = math.degrees(angle_rad)
    return angle_deg % 360.0


def compute_gain(beam: BeamConfig, target_angle: float) -> float:
    diff = (target_angle - beam.direction + 180.0) % 360.0 - 180.0
    abs_diff = abs(diff)
    half_width = beam.width / 2.0
    
    if abs_diff <= half_width:
        # Main lobe: cos^2 pattern
        gain = beam.max_gain * (math.cos(math.pi * diff / beam.width) ** 2)
    elif abs_diff <= beam.width:
        # Side lobe: 20% of max gain (realistic side lobe leakage)
        gain = beam.max_gain * 0.2 * (math.cos(math.pi * diff / beam.width) ** 2)
    else:
        # Far out: minimal residual gain (not zero)
        gain = beam.max_gain * 0.05
    
    return float(gain)
