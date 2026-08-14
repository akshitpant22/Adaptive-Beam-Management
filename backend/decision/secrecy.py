import math
from typing import Dict, Any, Optional, List
from beamforming.beam import BeamConfig
from propagation.signal import (
    compute_signal_at_point,
    compute_path_loss,
    compute_snr_linear,
)
from propagation.reflection import compute_reflection_paths


def compute_secrecy_capacity(
    snr_receiver_linear: float, snr_warden_linear: float
) -> float:
    """Compute Secrecy Capacity (in bits/s/Hz) using Wyner's wiretap channel model."""
    cs = math.log2(1.0 + snr_receiver_linear) - math.log2(1.0 + snr_warden_linear)
    return float(max(0.0, cs))


def compute_full_secrecy_report(
    bs_x: float,
    bs_y: float,
    rx_x: float,
    rx_y: float,
    warden_x: float,
    warden_y: float,
    beam: BeamConfig,
    tx_power_dbm: float = 30.0,
    noise_floor_dbm: float = -90.0,
) -> Dict[str, Any]:
    """Compute complete secrecy capacity report comparing Receiver and Warden SNR levels."""
    rx_sig = compute_signal_at_point(
        bs_x, bs_y, rx_x, rx_y, beam, tx_power_dbm, noise_floor_dbm
    )
    warden_sig = compute_signal_at_point(
        bs_x, bs_y, warden_x, warden_y, beam, tx_power_dbm, noise_floor_dbm
    )

    secrecy_capacity = compute_secrecy_capacity(
        rx_sig["snr_linear"], warden_sig["snr_linear"]
    )
    is_secure = bool(secrecy_capacity > 0.0)

    return {
        "rx_snr_db": float(rx_sig["snr_db"]),
        "rx_snr_linear": float(rx_sig["snr_linear"]),
        "warden_snr_db": float(warden_sig["snr_db"]),
        "warden_snr_linear": float(warden_sig["snr_linear"]),
        "secrecy_capacity": float(secrecy_capacity),
        "is_secure": is_secure,
        "beam_direction": float(beam.direction),
        "beam_width": float(beam.width),
    }


def compute_reflection_aware_secrecy(
    bs_x: float,
    bs_y: float,
    rx_x: float,
    rx_y: float,
    warden_x: float,
    warden_y: float,
    beam: BeamConfig,
    buildings: List[Any],
    reflection_loss_db: float = 3.0,
    tx_power_dbm: float = 30.0,
    noise_floor_dbm: float = -90.0,
) -> Dict[str, Any]:
    """Compute reflection-aware secrecy capacity considering both direct and 1-hop reflected NLOS paths."""
    # 1. Compute direct path secrecy report
    direct_report = compute_full_secrecy_report(
        bs_x, bs_y, rx_x, rx_y, warden_x, warden_y, beam, tx_power_dbm, noise_floor_dbm
    )

    # 2. Find valid 1-hop reflection paths
    reflection_paths = compute_reflection_paths(bs_x, bs_y, rx_x, rx_y, buildings)

    direct_secrecy_capacity = float(direct_report["secrecy_capacity"])
    reflected_secrecy_capacity = 0.0
    reflection_point_x: Optional[float] = None
    reflection_point_y: Optional[float] = None

    # 3. If reflection paths exist, evaluate shortest path
    if reflection_paths:
        best_path = min(reflection_paths, key=lambda p: p["total_path_length"])
        reflection_point_x = float(best_path["reflection_x"])
        reflection_point_y = float(best_path["reflection_y"])

        # Compute reflected SNR at Receiver
        ref_path_loss = compute_path_loss(best_path["total_path_length"])
        ref_rx_power = (
            tx_power_dbm + beam.max_gain - ref_path_loss - reflection_loss_db
        )
        ref_snr_db = max(0.0, ref_rx_power - noise_floor_dbm)
        ref_snr_linear = compute_snr_linear(ref_snr_db)

        # Compute secrecy capacity over reflected path
        ref_secrecy = compute_secrecy_capacity(
            ref_snr_linear, direct_report["warden_snr_linear"]
        )
        reflected_secrecy_capacity = float(ref_secrecy)

    best_secrecy_capacity = max(direct_secrecy_capacity, reflected_secrecy_capacity)
    use_reflection = bool(reflected_secrecy_capacity > direct_secrecy_capacity)
    is_secure = bool(best_secrecy_capacity > 0.0)

    return {
        "direct_secrecy_capacity": float(direct_secrecy_capacity),
        "reflected_secrecy_capacity": float(reflected_secrecy_capacity),
        "best_secrecy_capacity": float(best_secrecy_capacity),
        "use_reflection": use_reflection,
        "reflection_point_x": reflection_point_x,
        "reflection_point_y": reflection_point_y,
        "direct_rx_snr_db": float(direct_report["rx_snr_db"]),
        "direct_warden_snr_db": float(direct_report["warden_snr_db"]),
        "is_secure": is_secure,
    }
