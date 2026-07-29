import asyncio
import dataclasses
from dataclasses import asdict
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from simulation.environment import create_default_environment
from simulation.loop import SimulationLoop

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


@app.websocket("/ws/simulation")
async def websocket_simulation(websocket: WebSocket):
    await websocket.accept()
    sim = SimulationLoop()
    try:
        while True:
            log_entry = sim.step()
            await websocket.send_json(log_entry)
            await asyncio.sleep(0.05)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
