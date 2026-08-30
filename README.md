# Adaptive Beam Management Simulator
### Secure Wireless Communication Simulator — Internship Project

A real-time simulation of **adaptive beamforming for physical layer security** in indoor wireless networks. The system continuously steers a directional beam to maximise secrecy capacity (Cs) against a mobile eavesdropper (Warden), switching to NLOS reflection paths when the direct route is compromised.

---

## System Architecture

```
+----------------------------------------------------------+
|                  FRONTEND (React + Konva)                |
|  Canvas: BS · Receiver · Warden · Beam cone · Walls     |
|  Sidebar: Beam Status tab | Metrics tab                  |
|  Scenarios: Direct · Warden In-Between · Blocked · NLOS  |
+------------------------+---------------------------------+
                         | WebSocket (ws://localhost:8000)
+------------------------v---------------------------------+
|                  BACKEND (FastAPI + uvicorn)             |
|                                                          |
|  +-------------+  +--------------+  +--------------+    |
|  | Tracking    |  | Propagation  |  | Decision     |    |
|  | kalman.py   |  | signal.py    |  | engine.py    |    |
|  | (Kalman 2D) |  | (LDPL model) |  | (Beam steer) |    |
|  +-------------+  +--------------+  +--------------+    |
|                                            |             |
|  +-------------+  +------------------------v---------+  |
|  | Beamforming |  | Decision / secrecy.py             |  |
|  | beam.py     |<-| Wyner wiretap Cs computation      |  |
|  | (cos2 gain) |  | Reflection-aware NLOS routing     |  |
|  +-------------+  +----------------------------------+   |
|                                                          |
|  simulation/loop.py  -- main tick loop (50 ms)           |
|  simulation/logger.py -- SQLite telemetry logging        |
+----------------------------------------------------------+
```

---

## Key Technologies and Models

| Layer | Model | File |
|---|---|---|
| Antenna gain | Cosine-Squared beam pattern | beamforming/beam.py |
| RF propagation | Log-Distance Path Loss (n = 3.5) | propagation/signal.py |
| Reflection | Specular 1-hop NLOS path geometry | propagation/reflection.py |
| Secrecy metric | Wyner wiretap channel capacity Cs | decision/secrecy.py |
| Beam steering | Adaptive direction and width optimiser | decision/engine.py |
| Threat tracking | 2D Kalman filter [x, y, vx, vy] | tracking/kalman.py |
| Telemetry | SQLite per-tick logging | simulation/logger.py |

---

## How to Run

### Backend
```
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend
```
cd frontend
npm install
npm run dev
```
Frontend runs at: http://localhost:5173

---

## Simulation Scenarios

| Scenario | Warden Position | Expected Behaviour |
|---|---|---|
| Direct Path | Far from BS-Rx line | Narrow 15 deg beam direct to Receiver, SECURE |
| Warden In-Between | On BS-Rx direct path | Reflection mode activates, beam steered to wall |
| Warden Blocked | Behind a wall | Warden occluded, direct beam, SECURE |
| Reflection / NLOS | Adjacent to Receiver | Reflection path evaluated, best Cs selected |

---

## Output Metrics (per tick)

- Cs (Secrecy Capacity, bps/Hz): positive = secure link
- SNR_Rx: Receiver signal-to-noise ratio (dB)
- SNR_W: Warden signal-to-noise ratio (dB)
- Beam Direction: optimal boresight angle (degrees)
- Beam Width: 15 degrees fixed narrow beam
- Mode: DIRECT or REFLECTION
- Kalman Estimate: filtered Warden position (x, y)

---

## Project Structure

```
beam-management-sim/
+-- backend/
|   +-- beamforming/       Antenna gain model
|   +-- decision/          Beam optimiser + secrecy engine
|   +-- propagation/       Path loss + reflection geometry
|   +-- simulation/        Tick loop + SQLite logger
|   +-- tracking/          Kalman filter
|   +-- main.py            FastAPI app + WebSocket endpoint
+-- frontend/
|   +-- src/App.tsx        React + Konva simulation UI
+-- MODELS.md              Detailed model documentation
+-- README.md
```

---

## References

1. Wyner, A.D. (1975). The Wire-Tap Channel. Bell System Technical Journal, 54(8), 1355-1387.
2. Mukherjee, A. et al. (2014). Principles of Physical Layer Security in Multiuser Wireless Networks. IEEE Communications Surveys and Tutorials, 16(3), 1550-1573.
3. Rappaport, T.S. (2002). Wireless Communications: Principles and Practice, 2nd ed. Prentice Hall.
4. ITU-R P.1238 -- Propagation data and prediction methods for planning indoor radiocommunication systems.
