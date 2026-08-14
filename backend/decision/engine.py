from dataclasses import dataclass
from typing import Dict, Any, Optional, List
from beamforming.beam import BeamConfig, compute_angle
from decision.secrecy import compute_reflection_aware_secrecy


@dataclass
class DecisionEngineConfig:
    min_beam_width: float = 20.0  # Narrowest allowed beam in degrees
    max_beam_width: float = 120.0  # Widest allowed beam in degrees
    width_step: float = 30.0  # Step size when searching beam widths
    direction_search_range: float = 30.0  # Search ±30 degrees around BS->Receiver angle
    direction_step: float = 10.0  # Step size for direction search
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
        buildings: Optional[List[Any]] = None,
    ) -> Dict[str, Any]:
        """2D Grid search over beam direction and beam width using reflection-aware secrecy capacity."""
        # 1. Compute direct angle from Base Station to Receiver
        rx_angle = compute_angle(bs_x, bs_y, rx_x, rx_y)

        best_beam: Optional[BeamConfig] = None
        best_report: Optional[Dict[str, Any]] = None
        max_secrecy_capacity: float = -1.0

        target_buildings = buildings if buildings is not None else []

        # 2. Nested grid search over candidate directions and beam widths
        start_dir = rx_angle - self.config.direction_search_range
        end_dir = rx_angle + self.config.direction_search_range

        d = start_dir
        while d <= end_dir + 1e-6:
            # Normalize direction angle to [0, 360)
            norm_direction = d % 360.0

            w = self.config.min_beam_width
            while w <= self.config.max_beam_width + 1e-6:
                candidate_beam = BeamConfig(direction=norm_direction, width=w)
                report = compute_reflection_aware_secrecy(
                    bs_x,
                    bs_y,
                    rx_x,
                    rx_y,
                    warden_x,
                    warden_y,
                    candidate_beam,
                    target_buildings,
                    tx_power_dbm=self.config.tx_power_dbm,
                    noise_floor_dbm=self.config.noise_floor_dbm,
                )

                if report["best_secrecy_capacity"] > max_secrecy_capacity:
                    max_secrecy_capacity = report["best_secrecy_capacity"]
                    best_beam = candidate_beam
                    best_report = report

                w += self.config.width_step
            d += self.config.direction_step

        # Default fallback if search range is invalid
        if best_beam is None or best_report is None:
            best_beam = BeamConfig(direction=rx_angle, width=self.config.min_beam_width)
            best_report = compute_reflection_aware_secrecy(
                bs_x,
                bs_y,
                rx_x,
                rx_y,
                warden_x,
                warden_y,
                best_beam,
                target_buildings,
                tx_power_dbm=self.config.tx_power_dbm,
                noise_floor_dbm=self.config.noise_floor_dbm,
            )

        # 3. Store best beam configuration and secrecy report
        self.last_beam = best_beam
        self.last_secrecy_report = best_report

        # 4. Return summary dictionary with exact keys requested
        return {
            "optimal_direction": float(best_beam.direction),
            "optimal_width": float(best_beam.width),
            "rx_snr_db": float(best_report["direct_rx_snr_db"]),
            "warden_snr_db": float(best_report["direct_warden_snr_db"]),
            "secrecy_capacity": float(best_report["best_secrecy_capacity"]),
            "is_secure": bool(best_report["is_secure"]),
            "use_reflection": bool(best_report["use_reflection"]),
            "reflection_point_x": best_report["reflection_point_x"],
            "reflection_point_y": best_report["reflection_point_y"],
            "direct_secrecy_capacity": float(best_report["direct_secrecy_capacity"]),
            "reflected_secrecy_capacity": float(best_report["reflected_secrecy_capacity"]),
        }
