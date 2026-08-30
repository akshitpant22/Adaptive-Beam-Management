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
    """Create a 9-block city grid layout on a 1000x1000 map with road corridors."""
    buildings = [
        Building(id=1, x=80.0, y=50.0, width=150.0, height=120.0),
        Building(id=2, x=320.0, y=50.0, width=150.0, height=120.0),
        Building(id=3, x=560.0, y=50.0, width=150.0, height=120.0),
        Building(id=4, x=80.0, y=300.0, width=150.0, height=120.0),
        Building(id=5, x=320.0, y=300.0, width=150.0, height=120.0),
        Building(id=6, x=560.0, y=300.0, width=150.0, height=120.0),
        Building(id=7, x=80.0, y=560.0, width=150.0, height=120.0),
        Building(id=8, x=320.0, y=560.0, width=150.0, height=120.0),
        Building(id=9, x=560.0, y=560.0, width=150.0, height=120.0),
    ]

    base_station = BaseStation(x=30.0, y=450.0, tx_power=1.0)
    receiver = Receiver(x=950.0, y=450.0)
    warden = Warden(id=1, x=275.0, y=235.0, vx=2.0, vy=1.5)

    return {
        "buildings": buildings,
        "base_station": base_station,
        "receiver": receiver,
        "warden": warden,
    }
