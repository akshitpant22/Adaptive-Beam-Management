from typing import Dict, List, Any
from simulation.environment import (
    Building,
    BaseStation,
    Receiver,
    Warden,
    create_default_environment,
)
from tracking.kalman import KalmanFilter2D, add_sensor_noise


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

    def move_warden(self) -> None:
        """Update warden position and handle boundary bounces on a 1000x1000 grid."""
        self.warden.x += self.warden.vx
        self.warden.y += self.warden.vy

        # Boundary bounce check
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

        # 5. Build tick log entry
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
        }

        self.history.append(log_entry)
        self.current_tick += 1

        return log_entry

    def run(self) -> List[Dict[str, Any]]:
        """Run the simulation loop for total_ticks and return history."""
        for _ in range(self.total_ticks):
            self.step()
        return self.history
