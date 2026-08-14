from typing import Dict, List, Any
from simulation.environment import (
    Building,
    BaseStation,
    Receiver,
    Warden,
    create_default_environment,
)
from tracking.kalman import KalmanFilter2D, add_sensor_noise
from decision.engine import DecisionEngine, DecisionEngineConfig
from propagation.occlusion import get_los_status
from simulation.logger import SimulationLogger


class SimulationLoop:
    def __init__(
        self, dt: float = 1.0, noise_std: float = 5.0, total_ticks: int = 200
    ):
        # Load default environment data
        self.env = create_default_environment()
        self.warden: Warden = self.env["warden"]
        self.buildings: List[Building] = self.env["buildings"]
        self.base_station: BaseStation = self.env["base_station"]
        self.receiver: Receiver = self.env["receiver"]

        self.dt = dt
        self.noise_std = noise_std
        self.total_ticks = total_ticks
        self.current_tick = 0
        self.history: List[Dict[str, Any]] = []

        # Initialize Kalman Filter and update with warden starting position
        self.kf = KalmanFilter2D(
            dt=self.dt, process_noise=1.0, measurement_noise=self.noise_std**2
        )
        self.kf.update(self.warden.x, self.warden.y)

        # Initialize Decision Engine and Logger
        self.decision_engine = DecisionEngine()
        self.last_beam_decision = None
        self.logger = SimulationLogger()

    def move_warden(self) -> None:
        """Update warden position with building collision detection and boundary bounces."""
        def point_in_building(px: float, py: float, building: Any) -> bool:
            return (
                building.x <= px <= building.x + building.width
                and building.y <= py <= building.y + building.height
            )

        # 1. Try X movement first
        new_x = self.warden.x + self.warden.vx
        new_y = self.warden.y

        x_collision = any(
            point_in_building(new_x, new_y, b) for b in self.buildings
        )
        if x_collision:
            self.warden.vx = -self.warden.vx
        else:
            self.warden.x = new_x

        # 2. Try Y movement second
        new_y = self.warden.y + self.warden.vy
        new_x = self.warden.x

        y_collision = any(
            point_in_building(new_x, new_y, b) for b in self.buildings
        )
        if y_collision:
            self.warden.vy = -self.warden.vy
        else:
            self.warden.y = new_y

        # 3. Boundary bounce check
        if self.warden.x < 0 or self.warden.x > 1000:
            self.warden.vx = -self.warden.vx

        if self.warden.y < 0 or self.warden.y > 1000:
            self.warden.vy = -self.warden.vy

    def step(self) -> Dict[str, Any]:
        """Execute a single simulation step."""
        # 1. Move warden
        self.move_warden()

        # 2. Get noisy position measurement
        noisy_x, noisy_y = add_sensor_noise(
            self.warden.x, self.warden.y, self.noise_std
        )

        # 3. Kalman Filter predict and update steps
        self.kf.predict()
        filtered_x, filtered_y = self.kf.update(noisy_x, noisy_y)

        # 4. Extract full estimated state (x, y, vx, vy)
        _, _, vx_est, vy_est = self.kf.get_state()

        # 5. Compute optimal beam decision using Kalman filtered warden position
        beam_decision = self.decision_engine.compute_optimal_beam(
            bs_x=self.base_station.x,
            bs_y=self.base_station.y,
            rx_x=self.receiver.x,
            rx_y=self.receiver.y,
            warden_x=filtered_x,
            warden_y=filtered_y,
            buildings=self.buildings,
        )
        self.last_beam_decision = beam_decision

        # 6. Compute Line-of-Sight status for Warden and Receiver
        los_status = get_los_status(
            bs_x=self.base_station.x,
            bs_y=self.base_station.y,
            warden_x=self.warden.x,
            warden_y=self.warden.y,
            rx_x=self.receiver.x,
            rx_y=self.receiver.y,
            buildings=self.buildings,
        )

        # 7. Build tick log entry
        log_entry = {
            "tick": self.current_tick,
            "true_x": float(self.warden.x),
            "true_y": float(self.warden.y),
            "noisy_x": float(noisy_x),
            "noisy_y": float(noisy_y),
            "filtered_x": float(filtered_x),
            "filtered_y": float(filtered_y),
            "vx_estimated": float(vx_est),
            "vy_estimated": float(vy_est),
            "optimal_direction": beam_decision["optimal_direction"],
            "optimal_width": beam_decision["optimal_width"],
            "rx_snr_db": beam_decision["rx_snr_db"],
            "warden_snr_db": beam_decision["warden_snr_db"],
            "secrecy_capacity": beam_decision["secrecy_capacity"],
            "is_secure": beam_decision["is_secure"],
            "use_reflection": beam_decision["use_reflection"],
            "reflection_point_x": beam_decision["reflection_point_x"],
            "reflection_point_y": beam_decision["reflection_point_y"],
            "direct_secrecy_capacity": beam_decision["direct_secrecy_capacity"],
            "reflected_secrecy_capacity": beam_decision["reflected_secrecy_capacity"],
            "bs_to_warden_los": los_status["bs_to_warden_los"],
            "bs_to_rx_los": los_status["bs_to_rx_los"],
            "warden_blocked": los_status["warden_blocked"],
            "rx_blocked": los_status["rx_blocked"],
        }

        # 8. Log tick into SQLite database
        self.logger.log_tick(log_entry)

        self.history.append(log_entry)
        self.current_tick += 1

        return log_entry

    def get_session_summary(self) -> Dict[str, Any]:
        """Return database summary stats for current simulation session."""
        return self.logger.get_session_summary()

    def run(self) -> List[Dict[str, Any]]:
        """Run the simulation loop for total_ticks and return history."""
        for _ in range(self.total_ticks):
            self.step()
        return self.history
