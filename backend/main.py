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

warden_override: Optional[Dict[str, float]] = None

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class WardenPosition(BaseModel):
    x: float
    y: float


def snap_to_safe_position(x: float, y: float) -> tuple:
    # Road center coordinates (safe positions on roads)
    road_centers_x = [222.5, 522.5, 772.5]  # vertical road centers
    road_centers_y = [222.5, 472.5, 722.5]  # horizontal road centers

    # Check if point is inside any building
    from simulation.environment import create_default_environment

    env = create_default_environment()
    buildings = env["buildings"]

    def point_in_building(px, py, b):
        return b.x <= px <= b.x + b.width and b.y <= py <= b.y + b.height

    is_inside = any(point_in_building(x, y, b) for b in buildings)

    if not is_inside:
        return x, y  # Position is safe, return as-is

    # Find nearest road intersection point
    best_x, best_y = x, y
    best_dist = float("inf")

    for rx in road_centers_x:
        for ry in road_centers_y:
            dist = ((x - rx) ** 2 + (y - ry) ** 2) ** 0.5
            if dist < best_dist:
                best_dist = dist
                best_x, best_y = rx, ry

    # Also check nearest point on each road axis
    for rx in road_centers_x:
        dist = abs(x - rx)
        if dist < best_dist:
            best_dist = dist
            best_x, best_y = rx, y

    for ry in road_centers_y:
        dist = abs(y - ry)
        if dist < best_dist:
            best_dist = dist
            best_x, best_y = x, ry

    return best_x, best_y


@app.post("/warden/position")
def update_warden_position(pos: WardenPosition):
    global warden_override
    safe_x, safe_y = snap_to_safe_position(pos.x, pos.y)
    warden_override = {"x": safe_x, "y": safe_y}
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
    global warden_override
    await websocket.accept()
    sim = SimulationLoop()
    try:
        while True:
            if warden_override is not None:
                sim.warden.x = warden_override["x"]
                sim.warden.y = warden_override["y"]
                # Reset Kalman filter to new position
                sim.kf.x[0, 0] = warden_override["x"]
                sim.kf.x[1, 0] = warden_override["y"]
                sim.kf.x[2, 0] = 0.0
                sim.kf.x[3, 0] = 0.0
                warden_override = None
            log_entry = sim.step()
            await websocket.send_json(log_entry)
            await asyncio.sleep(0.05)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
