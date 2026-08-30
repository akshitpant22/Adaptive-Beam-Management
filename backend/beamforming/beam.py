import math
from dataclasses import dataclass


# ── Antenna Beam Pattern Model ──────────────────────────────────────────────
# Implements the Cosine-Squared (cos²) directional antenna gain pattern,
# a standard analytical beam model widely used in wireless security and
# beamforming literature (e.g., Mukherjee et al., "Principles of Physical
# Layer Security in Multiuser Wireless Networks", IEEE COMST 2014).
#
# Gain formula (within half-beamwidth θ_hw):
#   G(θ) = G_max · cos²( π · θ / (2 · θ_hw) )
#
# where:
#   G_max   = maximum boresight gain (30 dB default)
#   θ       = angular offset from beam boresight (degrees)
#   θ_hw    = half-beamwidth = width / 2 (degrees)
#
# Sidelobe region (θ_hw < |θ| ≤ width): G = 2 dB (constant sidelobe floor)
# Null region (|θ| > width):             G = 0 dB (no power)
# ────────────────────────────────────────────────────────────────────────────


@dataclass
class BeamConfig:
    direction: float  # Boresight angle in degrees [0, 360]
    width: float      # Full 3 dB beamwidth in degrees
    max_gain: float = 30.0  # Maximum boresight gain in dB


def compute_angle(from_x: float, from_y: float, to_x: float, to_y: float) -> float:
    """Compute angle in degrees [0, 360] from source point (from_x, from_y) to target point (to_x, to_y)."""
    dx = to_x - from_x
    dy = to_y - from_y
    angle_rad = math.atan2(dy, dx)
    angle_deg = math.degrees(angle_rad)
    return angle_deg % 360.0


def compute_gain(beam: BeamConfig, target_angle: float) -> float:
    """Compute antenna gain (dB) at target_angle using the Cosine-Squared beam pattern model."""
    diff = (target_angle - beam.direction + 180.0) % 360.0 - 180.0
    abs_diff = abs(diff)
    half_width = beam.width / 2.0

    if abs_diff <= half_width:
        normalized = diff / half_width
        gain = beam.max_gain * (math.cos(math.pi * normalized / 2.0) ** 2)
    elif abs_diff <= beam.width:
        gain = 2.0
    else:
        gain = 0.0

    return float(gain)
