from dataclasses import dataclass
from typing import Dict, List, Any


@dataclass
class Building:
    id: int
    x: float
    y: float
    width: float
    height: float


@dataclass
class BaseStation:
    x: float
    y: float
    tx_power: float = 1.0


@dataclass
class Receiver:
    x: float
    y: float


@dataclass
class Warden:
    id: int
    x: float
    y: float
    vx: float = 0.0
    vy: float = 0.0


def create_default_environment() -> Dict[str, Any]:
    buildings = [
        Building(id=1, x=300.0, y=200.0, width=100.0, height=250.0),
        Building(id=2, x=500.0, y=400.0, width=120.0, height=200.0),
        Building(id=3, x=700.0, y=150.0, width=80.0, height=300.0),
    ]

    base_station = BaseStation(x=50.0, y=500.0, tx_power=1.0)
    receiver = Receiver(x=950.0, y=500.0)
    warden = Warden(id=1, x=200.0, y=200.0, vx=1.0, vy=0.5)

    return {
        "buildings": buildings,
        "base_station": base_station,
        "receiver": receiver,
        "warden": warden,
    }
