import math
from typing import Dict, Any
from beamforming.beam import BeamConfig, compute_gain, compute_angle


def compute_path_loss(
    distance: float,
    reference_distance: float = 1.0,
    path_loss_exponent: float = 2.0,
) -> float:
    """Compute free-space path loss (in dB) using logarithmic path loss model."""
    if distance < reference_distance:
        distance = reference_distance

    path_loss = 10.0 * path_loss_exponent * math.log10(distance / reference_distance)
    return float(path_loss)


def compute_received_power(
    tx_power_dbm: float, gain_db: float, path_loss_db: float
) -> float:
    """Compute received power (in dBm) using link budget equation."""
    received_power = tx_power_dbm + gain_db - path_loss_db
    return float(received_power)


def compute_snr(received_power_dbm: float, noise_floor_dbm: float = -90.0) -> float:
    """Compute Signal-to-Noise Ratio (in dB). Clamped to 0.0 minimum."""
    snr = received_power_dbm - noise_floor_dbm
    if snr < 0.0:
        return 0.0
    return float(snr)


def compute_snr_linear(snr_db: float) -> float:
    """Convert Signal-to-Noise Ratio from dB scale to linear scale."""
    return float(10.0 ** (snr_db / 10.0))


def compute_signal_at_point(
    bs_x: float,
    bs_y: float,
    target_x: float,
    target_y: float,
    beam: BeamConfig,
    tx_power_dbm: float = 30.0,
    noise_floor_dbm: float = -90.0,
) -> Dict[str, float]:
    """Compute full RF signal report (angle, gain, distance, path loss, received power, SNR) at target point."""
    angle = compute_angle(bs_x, bs_y, target_x, target_y)
    gain_db = compute_gain(beam, angle)
    distance = math.sqrt((target_x - bs_x) ** 2 + (target_y - bs_y) ** 2)

    path_loss_db = compute_path_loss(distance)
    received_power_dbm = compute_received_power(tx_power_dbm, gain_db, path_loss_db)
    snr_db = compute_snr(received_power_dbm, noise_floor_dbm)
    snr_linear = compute_snr_linear(snr_db)

    return {
        "angle": float(angle),
        "gain_db": float(gain_db),
        "distance": float(distance),
        "path_loss_db": float(path_loss_db),
        "received_power_dbm": float(received_power_dbm),
        "snr_db": float(snr_db),
        "snr_linear": float(snr_linear),
    }
