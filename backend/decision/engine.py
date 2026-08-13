from dataclasses import dataclass
from typing import Dict, Any, Optional
from beamforming.beam import BeamConfig, compute_angle
from decision.secrecy import compute_full_secrecy_report


@dataclass
class DecisionEngineConfig:
    min_beam_width: float = 20.0  # Narrowest allowed beam in degrees
    max_beam_width: float = 120.0  # Widest allowed beam in degrees
    width_step: float = 20.0  # Step size when searching beam widths
    tx_power_dbm: float = 30.0
    noise_floor_dbm: float = -90.0
    secrecy_threshold: float = 0.5  # Minimum acceptable secrecy capacity


class DecisionEngine:
    def __init__(self, config: Optional[DecisionEngineConfig] = None):
        self.config = config if config is not None else DecisionEngineConfig()
        self.last_beam: BeamConfig = BeamConfig(direction=0.0, width=60.0)
        self.last_secrecy_report: Optional[Dict[str, Any]] = None

    def compute_optimal_beam(
        self,
        bs_x: float,
        bs_y: float,
        rx_x: float,
        rx_y: float,
        warden_x: float,
        warden_y: float,
    ) -> Dict[str, Any]:
        """Search over candidate beam widths pointing at Receiver to maximize secrecy capacity."""
        # 1. Compute direct angle from Base Station to Receiver
        rx_angle = compute_angle(bs_x, bs_y, rx_x, rx_y)

        best_beam: Optional[BeamConfig] = None
        best_report: Optional[Dict[str, Any]] = None
        max_secrecy_capacity: float = -1.0

        # 2. Search over candidate beam widths
        w = self.config.min_beam_width
        while w <= self.config.max_beam_width + 1e-6:
            candidate_beam = BeamConfig(direction=rx_angle, width=w)
            report = compute_full_secrecy_report(
                bs_x,
                bs_y,
                rx_x,
                rx_y,
                warden_x,
                warden_y,
                candidate_beam,
                self.config.tx_power_dbm,
                self.config.noise_floor_dbm,
            )

            if report["secrecy_capacity"] > max_secrecy_capacity:
                max_secrecy_capacity = report["secrecy_capacity"]
                best_beam = candidate_beam
                best_report = report

            w += self.config.width_step

        # Default fallback if search range is invalid
        if best_beam is None or best_report is None:
            best_beam = BeamConfig(direction=rx_angle, width=self.config.min_beam_width)
            best_report = compute_full_secrecy_report(
                bs_x,
                bs_y,
                rx_x,
                rx_y,
                warden_x,
                warden_y,
                best_beam,
                self.config.tx_power_dbm,
                self.config.noise_floor_dbm,
            )

        # 3. Store best beam and secrecy report
        self.last_beam = best_beam
        self.last_secrecy_report = best_report

        # 4. Return summary dictionary with exact keys requested
        return {
            "optimal_direction": float(best_beam.direction),
            "optimal_width": float(best_beam.width),
            "rx_snr_db": float(best_report["rx_snr_db"]),
            "warden_snr_db": float(best_report["warden_snr_db"]),
            "secrecy_capacity": float(best_report["secrecy_capacity"]),
            "is_secure": bool(best_report["is_secure"]),
        }
