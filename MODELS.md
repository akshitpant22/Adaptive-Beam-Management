# Model Documentation
### Adaptive Beam Management Simulator — Technical Model Reference

This document formally describes all mathematical models used in the simulator.

---

## 1. Antenna Gain Model — Cosine-Squared Beam Pattern

File: backend/beamforming/beam.py

The directional antenna gain G(theta) uses the Cosine-Squared beam pattern:

    G(theta) = G_max * cos^2( pi * theta / (2 * theta_hw) )   for |theta| <= theta_hw
    G(theta) = 2 dB                                            for theta_hw < |theta| <= theta_bw
    G(theta) = 0 dB                                            for |theta| > theta_bw

Parameters:
  G_max   = 30 dB        Maximum boresight gain
  theta_hw = width / 2   Half-beamwidth (degrees)
  theta_bw = 15 deg      Full 3 dB beamwidth (fixed)
  theta    = angular offset from boresight

Reference: Mukherjee et al., IEEE COMST 2014.

---

## 2. Propagation Model — Log-Distance Path Loss (LDPL)

File: backend/propagation/signal.py

RF propagation follows the Log-Distance Path Loss model (ITU-R P.1238):

    PL(d) = 10 * n * log10( d / d0 )            [dB]
    P_r   = P_t + G(theta) - PL(d)              [dBm]
    SNR   = P_r - N0                            [dB]

Parameters:
  n    = 3.5          Path loss exponent (dense indoor / obstructed)
  d0   = 1.0 m        Close-in reference distance
  P_t  = 30 dBm       Transmit power
  N0   = -90 dBm      Thermal noise floor

Why n = 3.5?
  Free space: n = 2. Obstructed indoor with walls and furniture: n = 3 to 4.
  n = 3.5 is a standard value for dense indoor environments
  (Rappaport, 2002, Table 3.2).

---

## 3. Physical Layer Security — Wyner Wiretap Secrecy Capacity

File: backend/decision/secrecy.py

The secrecy capacity Cs of the Gaussian wiretap channel (Wyner, 1975):

    Cs = max( 0,  log2(1 + SNR_Rx) - log2(1 + SNR_W) )     [bps/Hz]

  Cs > 0  =>  SECURE:      Receiver decodes faster than Warden can intercept.
  Cs = 0  =>  COMPROMISED: Warden channel capacity >= Receiver channel capacity.

The system selects the mode (Direct or Reflection) that maximises Cs.

---

## 4. NLOS Reflection Path Routing

Files: backend/decision/secrecy.py, backend/propagation/reflection.py

When the direct path is compromised (Cs_direct = 0), the system evaluates
1-hop specular reflection paths off building walls.

Specular reflection condition: angle of incidence = angle of reflection.

For each candidate reflection point R = (rx, ry) on a wall:

    Total path length = d(BS -> R) + d(R -> Rx)
    P_r_refl = P_t + G_max - PL(d_total) - L_refl
    Cs_refl  = max( 0, log2(1 + SNR_Rx_refl) - log2(1 + SNR_W_refl) )

Parameters:
  L_refl    = 2 dB       Reflection surface loss
  Hysteresis = 0.5 bps/Hz  Margin before switching back to direct path

Mode switching rule:
    Use Reflection = True   if Cs_refl > 0 AND Cs_refl > Cs_direct - 0.5
    Use Reflection = False  otherwise

The 0.5 bps/Hz hysteresis prevents rapid mode oscillation at the boundary.

---

## 5. Threat Tracking — Linear Kalman Filter (Bayesian Estimator)

File: backend/tracking/kalman.py

The Warden position is estimated using a 2D Kalman filter — the optimal
Bayesian estimator for linear Gaussian systems.

State vector: x = [x, y, vx, vy]'

State transition (constant velocity model):
    x_k|k-1 = F * x_k-1 + w,   w ~ N(0, Q)

    F = [ 1  0  dt  0 ]
        [ 0  1   0 dt ]
        [ 0  0   1  0 ]
        [ 0  0   0  1 ]

Measurement model:
    z_k = H * x_k + v,   v ~ N(0, R)

    H = [ 1  0  0  0 ]
        [ 0  1  0  0 ]

Kalman (Bayesian) update:
    K = P^- * H' * inv(H * P^- * H' + R)   (Kalman gain)
    x_hat = x^- + K * (z_k - H * x^-)      (posterior state)
    P = (I - K*H) * P^-                    (posterior covariance)

Bayesian interpretation:
  Prior       = predicted state x^-, covariance P^-
  Likelihood  = measurement z_k with sensor noise R
  Posterior   = updated state x_hat, covariance P

Parameters:
  dt   = 1.0          Time step
  Q    = I * 1.0      Process noise covariance
  R    = I * 10.0     Measurement noise covariance
  P0   = I * 0.1      Initial covariance (reset after Warden teleport)

---

## 6. Beam Decision Engine

File: backend/decision/engine.py

At each simulation tick the engine:
  1. Computes theta_Rx = angle from Base Station to Receiver
  2. Computes theta_W  = angle from Base Station to Kalman-estimated Warden
  3. Computes angle_diff = |theta_W - theta_Rx|
  4. Sets beam: direction = theta_Rx, width = 15 deg (fixed maximum focus)
  5. Evaluates secrecy capacity for both Direct and Reflection paths
  6. Returns the mode with highest Cs

The 15 deg beamwidth ensures maximum spatial isolation between
the intended Receiver and potential eavesdroppers.

---

## References

1. Wyner, A.D. (1975). The Wire-Tap Channel. Bell System Technical Journal, 54(8), 1355-1387.
2. Mukherjee, A. et al. (2014). Principles of Physical Layer Security in Multiuser Wireless
   Networks. IEEE Communications Surveys and Tutorials, 16(3), 1550-1573.
3. Rappaport, T.S. (2002). Wireless Communications: Principles and Practice, 2nd ed. Prentice Hall.
4. ITU-R P.1238 -- Propagation data and prediction methods for indoor radiocommunication.
5. Welch, G. and Bishop, G. (2006). An Introduction to the Kalman Filter. UNC TR 95-041.
