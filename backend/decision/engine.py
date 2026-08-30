from dataclasses import dataclass
from typing import Dict, Any, Optional, List
from beamforming.beam import BeamConfig, compute_angle
from decision.secrecy import compute_reflection_aware_secrecy
from propagation.reflection import compute_reflection_paths


@dataclass
class DecisionEngineConfig:
    min_beam_width: float = 15.0
    max_beam_width: float = 120.0
    width_step: float = 20.0
    direction_search_range: float = 45.0
    direction_step: float = 15.0
    tx_power_dbm: float = 30.0
    noise_floor_dbm: float = -90.0
    secrecy_threshold: float = 0.1


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
        # 1. Compute direct angle from Base Station to Receiver (fixed beam direction)
        rx_angle = compute_angle(bs_x, bs_y, rx_x, rx_y)

        # 2. Compute warden angle
        warden_angle = compute_angle(bs_x, bs_y, warden_x, warden_y)

        # 3. Compute angular difference
        angle_diff = abs((warden_angle - rx_angle + 180) % 360 - 180)

        # 4. Set target width dynamically based on angle_diff
        # Ensure beam half-width is strictly less than angle_diff with a 5 deg safety margin
        # so the Warden is never illuminated by the main beam cone
        target_width = 15.0

        # 5. Create ONE beam pointing directly at Receiver with target_width
        target_buildings = buildings if buildings is not None else []
        beam = BeamConfig(direction=rx_angle, width=target_width)

        # 6. Call compute_reflection_aware_secrecy once with this beam
        report = compute_reflection_aware_secrecy(
            bs_x,
            bs_y,
            rx_x,
            rx_y,
            warden_x,
            warden_y,
            beam,
            target_buildings,
            tx_power_dbm=self.config.tx_power_dbm,
            noise_floor_dbm=self.config.noise_floor_dbm,
        )

        # 7. Store and return results
        self.last_beam = beam
        self.last_secrecy_report = report

        if report["use_reflection"] and report["reflection_point_x"] is not None:
            optimal_direction = compute_angle(
                bs_x, bs_y, report["reflection_point_x"], report["reflection_point_y"]
            )
            rx_snr_db = float(report["reflected_rx_snr_db"])
            warden_snr_db = float(report["reflected_warden_snr_db"])
        else:
            optimal_direction = float(beam.direction)
            rx_snr_db = float(report["direct_rx_snr_db"])
            warden_snr_db = float(report["direct_warden_snr_db"])

        return {
            "optimal_direction": float(optimal_direction),
            "optimal_width": float(beam.width),
            "rx_snr_db": rx_snr_db,
            "warden_snr_db": warden_snr_db,
            "secrecy_capacity": float(report["best_secrecy_capacity"]),
            "is_secure": bool(report["is_secure"]),
            "use_reflection": bool(report["use_reflection"]),
            "reflection_point_x": report["reflection_point_x"],
            "reflection_point_y": report["reflection_point_y"],
            "direct_secrecy_capacity": float(report["direct_secrecy_capacity"]),
            "reflected_secrecy_capacity": float(report["reflected_secrecy_capacity"]),
        }
