import math
from typing import Dict, Any
from beamforming.beam import BeamConfig
from propagation.signal import compute_signal_at_point


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
