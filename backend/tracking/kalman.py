import numpy as np
from typing import Tuple


class KalmanFilter2D:
    def __init__(
        self, dt: float = 1.0, process_noise: float = 1.0, measurement_noise: float = 10.0
    ):
        self.dt = dt
        self.F = np.array(  #State Transition Matrix
            [
                [1.0, 0.0, self.dt, 0.0], #predicts next position using velocity 
                [0.0, 1.0, 0.0, self.dt],
                [0.0, 0.0, 1.0, 0.0],
                [0.0, 0.0, 0.0, 1.0],
            ],
            dtype=np.float64,
        )

        self.H = np.array( #Measurement Matrix
            [
                [1.0, 0.0, 0.0, 0.0], #extracts position from the state vector
                [0.0, 1.0, 0.0, 0.0],
            ],
            dtype=np.float64,
        )

        # Process Noise Matrix Q (4x4) - Represents uncertainty in our prediction model
        self.Q = np.eye(4, dtype=np.float64) * process_noise

        #Measurement Noise Matrix R (2x2): Represents sensor error
        self.R = np.eye(2, dtype=np.float64) * measurement_noise

        # State vector x (4x1 column vector): [x, y, vx, vy]
        self.x = np.zeros((4, 1), dtype=np.float64)

        # Covariance Matrix P (4x4): Stores uncertainty about the state estimate.
        self.P = np.eye(4, dtype=np.float64)

    def predict(self) -> Tuple[float, float]: #predict future state
        """Predict the next state and covariance using the process model F."""
        self.x = self.F @ self.x
        self.P = self.F @ self.P @ self.F.T + self.Q
        return float(self.x[0, 0]), float(self.x[1, 0])

    def update(self, measured_x: float, measured_y: float) -> Tuple[float, float]:
        """Update the state estimate using a new 2D position measurement."""
        z = np.array([[measured_x], [measured_y]], dtype=np.float64)
        
        # Innovation / Measurement residual y = z - H @ x
        y = z - (self.H @ self.x)
        
        # Innovation covariance S = H @ P @ H.T + R
        S = self.H @ self.P @ self.H.T + self.R
        
        # Optimal Kalman gain K = P @ H.T @ inv(S)
        K = self.P @ self.H.T @ np.linalg.inv(S)
        
        # Updated state estimate x = x + K @ y
        self.x = self.x + (K @ y)
        
        # Updated estimate covariance P = (I - K @ H) @ P
        I = np.eye(4, dtype=np.float64)
        self.P = (I - (K @ self.H)) @ self.P
        
        return float(self.x[0, 0]), float(self.x[1, 0])

    def get_state(self) -> Tuple[float, float, float, float]:
        """Return current state (x, y, vx, vy)."""
        return (
            float(self.x[0, 0]),
            float(self.x[1, 0]),
            float(self.x[2, 0]),
            float(self.x[3, 0]),
        )


def add_sensor_noise(true_x: float, true_y: float, noise_std: float = 5.0) -> Tuple[float, float]:
    """Add Gaussian zero-mean noise to true 2D position coordinates."""
    noisy_x = true_x + np.random.normal(0.0, noise_std)
    noisy_y = true_y + np.random.normal(0.0, noise_std)
    return float(noisy_x), float(noisy_y)
