import asyncio
import sqlite3
import dataclasses
from dataclasses import asdict
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from simulation.environment import create_default_environment
from simulation.loop import SimulationLoop
from decision.engine import DecisionEngineConfig

app = FastAPI()

warden_queue = []

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class WardenPosition(BaseModel):
    x: float
    y: float


def snap_to_safe_position(x: float, y: float) -> tuple:
    # Always allow these exact scenario positions
    known_safe = [
        (500.0, 450.0),   # Direct Path
        (395.0, 235.0),   # Behind Bldg
        (350.0, 350.0),   # Behind Bldg (alt)
        (850.0, 450.0),   # Near RX
        (800.0, 450.0),   # Near RX (alt)
        (515.0, 100.0),   # Clear
        (500.0, 100.0),   # Clear (alt)
    ]
    for sx, sy in known_safe:
        if abs(x - sx) <= 15.0 and abs(y - sy) <= 15.0:
            return float(x), float(y)

    from simulation.environment import create_default_environment
    env = create_default_environment()
    buildings = env["buildings"]

    def point_in_building(px, py, b):
        margin = 5.0
        return (b.x - margin <= px <= b.x + b.width + margin and
                b.y - margin <= py <= b.y + b.height + margin)

    is_inside = any(point_in_building(x, y, b) for b in buildings)

    if not is_inside:
        return float(x), float(y)

    # Find nearest road position
    road_x = [222.5, 485.0, 735.0]
    road_y = [222.5, 450.0, 685.0]

    best_x, best_y = x, y
    best_dist = float('inf')

    # Check road intersections
    for rx in road_x:
        for ry in road_y:
            dist = ((x - rx)**2 + (y - ry)**2)**0.5
            if dist < best_dist:
                best_dist = dist
                best_x, best_y = rx, ry

    # Check horizontal road snapping
    for ry in road_y:
        dist = abs(y - ry)
        if dist < best_dist:
            best_dist = dist
            best_x, best_y = x, ry

    # Check vertical road snapping
    for rx in road_x:
        dist = abs(x - rx)
        if dist < best_dist:
            best_dist = dist
            best_x, best_y = rx, y

    # Clamp to grid
    best_x = max(10.0, min(990.0, best_x))
    best_y = max(10.0, min(990.0, best_y))

    return float(best_x), float(best_y)


@app.post("/warden/position")
async def update_warden_position(pos: WardenPosition):
    safe_x, safe_y = snap_to_safe_position(pos.x, pos.y)
    warden_queue.clear()
    warden_queue.append({"x": safe_x, "y": safe_y})
    return {"status": "updated", "x": safe_x, "y": safe_y}


@app.get("/")
def read_root():
    return {"status": "Simulation backend running"}


@app.get("/environment")
def get_environment():
    env = create_default_environment()
    return {
        "buildings": [asdict(b) for b in env["buildings"]],
        "base_station": asdict(env["base_station"]),
        "receiver": asdict(env["receiver"]),
        "warden": asdict(env["warden"]),
    }


@app.get("/beam/config")
def get_beam_config():
    config = DecisionEngineConfig()
    return {
        "min_beam_width": config.min_beam_width,
        "max_beam_width": config.max_beam_width,
        "width_step": config.width_step,
        "tx_power_dbm": config.tx_power_dbm,
        "noise_floor_dbm": config.noise_floor_dbm,
        "secrecy_threshold": config.secrecy_threshold,
    }


@app.get("/simulation/status")
def get_simulation_status():
    return {
        "status": "running",
        "phase": "Phase 2 - Adaptive Beam Management",
        "modules": [
            "environment",
            "kalman_tracking",
            "beam_steering",
            "decision_engine",
        ],
    }


@app.get("/simulation/summary")
def get_simulation_summary():
    conn = sqlite3.connect("simulation_log.db")
    cursor = conn.cursor()

    # Get most recent session_id
    cursor.execute(
        "SELECT session_id FROM simulation_ticks ORDER BY id DESC LIMIT 1"
    )
    row = cursor.fetchone()
    if not row:
        conn.close()
        return {"error": "No simulation data yet. Run the simulation first."}

    session_id = row[0]

    cursor.execute(
        """
        SELECT 
            COUNT(*),
            SUM(CASE WHEN is_secure=1 THEN 1 ELSE 0 END),
            SUM(CASE WHEN is_secure=0 THEN 1 ELSE 0 END),
            SUM(CASE WHEN use_reflection=1 THEN 1 ELSE 0 END),
            AVG(secrecy_capacity),
            AVG(rx_snr_db),
            AVG(warden_snr_db)
        FROM simulation_ticks WHERE session_id = ?
    """,
        (session_id,),
    )

    r = cursor.fetchone()
    conn.close()

    return {
        "session_id": session_id,
        "total_ticks": int(r[0]) if r[0] else 0,
        "secure_ticks": int(r[1]) if r[1] else 0,
        "compromised_ticks": int(r[2]) if r[2] else 0,
        "reflection_used_ticks": int(r[3]) if r[3] else 0,
        "avg_secrecy_capacity": float(r[4]) if r[4] else 0.0,
        "avg_rx_snr_db": float(r[5]) if r[5] else 0.0,
        "avg_warden_snr_db": float(r[6]) if r[6] else 0.0,
    }


@app.get("/sessions")
def get_sessions():
    conn = sqlite3.connect("simulation_log.db")
    cursor = conn.cursor()
    query = """
    SELECT session_id, COUNT(*) as tick_count, 
           AVG(secrecy_capacity) as avg_secrecy,
           SUM(CASE WHEN is_secure=1 THEN 1 ELSE 0 END) as secure_ticks
    FROM simulation_ticks 
    GROUP BY session_id 
    ORDER BY session_id DESC
    """
    cursor.execute(query)
    rows = cursor.fetchall()
    conn.close()

    results = []
    for row in rows:
        results.append(
            {
                "session_id": row[0],
                "tick_count": int(row[1]),
                "avg_secrecy": float(row[2]) if row[2] is not None else 0.0,
                "secure_ticks": int(row[3]) if row[3] is not None else 0,
            }
        )
    return results


@app.get("/session/{session_id}/ticks")
def get_session_ticks(session_id: str):
    conn = sqlite3.connect("simulation_log.db")
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM simulation_ticks WHERE session_id = ? ORDER BY tick ASC",
        (session_id,),
    )
    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


@app.websocket("/ws/simulation")
async def websocket_simulation(websocket: WebSocket):
    await websocket.accept()
    sim = SimulationLoop()

    # Send initial environment state immediately so
    # frontend doesn't show stuck warden
    try:
        initial = {
            "tick": 0,
            "true_x": float(sim.warden.x),
            "true_y": float(sim.warden.y),
            "noisy_x": float(sim.warden.x),
            "noisy_y": float(sim.warden.y),
            "filtered_x": float(sim.warden.x),
            "filtered_y": float(sim.warden.y),
            "vx_estimated": float(sim.warden.vx),
            "vy_estimated": float(sim.warden.vy),
            "optimal_direction": 0.0,
            "optimal_width": 60.0,
            "rx_snr_db": 0.0,
            "warden_snr_db": 0.0,
            "secrecy_capacity": 0.0,
            "is_secure": True,
            "use_reflection": False,
            "reflection_point_x": None,
            "reflection_point_y": None,
            "direct_secrecy_capacity": 0.0,
            "reflected_secrecy_capacity": 0.0,
            "bs_to_warden_los": True,
            "bs_to_rx_los": True,
            "warden_blocked": False,
            "rx_blocked": False,
        }
        await websocket.send_json(initial)
    except Exception:
        pass

    try:
        while True:
            if warden_queue:
                pos = warden_queue.pop(0)
                sim.warden.x = pos["x"]
                sim.warden.y = pos["y"]
                sim.kf.x[0, 0] = pos["x"]
                sim.kf.x[1, 0] = pos["y"]
                sim.kf.x[2, 0] = 0.0
                sim.kf.x[3, 0] = 0.0
                import numpy as np
                sim.kf.P = np.eye(4) * 0.1
            log_entry = sim.step()
            await websocket.send_json(log_entry)
            await asyncio.sleep(0.05)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
