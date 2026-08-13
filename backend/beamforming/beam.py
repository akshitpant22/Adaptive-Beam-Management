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
    """Compute directive gain (in dB) for a given target angle based on beam configuration."""
    # Angular difference normalized to [-180, 180] range
    diff = (target_angle - beam.direction + 180.0) % 360.0 - 180.0

    # Parametric gain formula: cos^2 roll-off within main lobe half-width
    if abs(diff) <= (beam.width / 2.0):
        gain = beam.max_gain * (math.cos(math.pi * diff / beam.width) ** 2)
    else:
        gain = 0.0

    return float(gain)
