import sqlite3
import json
from datetime import datetime
from typing import Dict, Any, Optional


class SimulationLogger:
    def __init__(self, db_path: str = "simulation_log.db"):
        self.db_path = db_path
        self.conn = sqlite3.connect(self.db_path)
        self.session_id = datetime.now().strftime("session_%Y%m%d_%H%M%S")
        self._create_table()

    def _create_table(self) -> None:
        """Create simulation_ticks table if it does not exist."""
        query = """
        CREATE TABLE IF NOT EXISTS simulation_ticks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            tick INTEGER NOT NULL,
            timestamp TEXT NOT NULL,
            true_x REAL,
            true_y REAL,
            noisy_x REAL,
            noisy_y REAL,
            filtered_x REAL,
            filtered_y REAL,
            vx_estimated REAL,
            vy_estimated REAL,
            optimal_direction REAL,
            optimal_width REAL,
            rx_snr_db REAL,
            warden_snr_db REAL,
            secrecy_capacity REAL,
            is_secure INTEGER,
            use_reflection INTEGER,
            reflection_point_x REAL,
            reflection_point_y REAL,
            direct_secrecy_capacity REAL,
            reflected_secrecy_capacity REAL,
            los_warden INTEGER,
            los_rx INTEGER
        );
        """
        cursor = self.conn.cursor()
        cursor.execute(query)
        self.conn.commit()

    def log_tick(self, tick_data: Dict[str, Any]) -> None:
        """Insert a single simulation tick log entry into SQLite."""
        timestamp = datetime.now().isoformat()

        # Convert booleans to 1/0 integers for SQLite storage
        is_secure_int = 1 if tick_data.get("is_secure", False) else 0
        use_reflection_int = 1 if tick_data.get("use_reflection", False) else 0
        los_warden_int = (
            1
            if tick_data.get("los_warden", tick_data.get("bs_to_warden_los", True))
            else 0
        )
        los_rx_int = (
            1
            if tick_data.get("los_rx", tick_data.get("bs_to_rx_los", True))
            else 0
        )

        query = """
        INSERT INTO simulation_ticks (
            session_id, tick, timestamp, true_x, true_y, noisy_x, noisy_y,
            filtered_x, filtered_y, vx_estimated, vy_estimated,
            optimal_direction, optimal_width, rx_snr_db, warden_snr_db,
            secrecy_capacity, is_secure, use_reflection,
            reflection_point_x, reflection_point_y,
            direct_secrecy_capacity, reflected_secrecy_capacity,
            los_warden, los_rx
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        );
        """

        params = (
            self.session_id,
            int(tick_data.get("tick", 0)),
            timestamp,
            tick_data.get("true_x"),
            tick_data.get("true_y"),
            tick_data.get("noisy_x"),
            tick_data.get("noisy_y"),
            tick_data.get("filtered_x"),
            tick_data.get("filtered_y"),
            tick_data.get("vx_estimated"),
            tick_data.get("vy_estimated"),
            tick_data.get("optimal_direction"),
            tick_data.get("optimal_width"),
            tick_data.get("rx_snr_db"),
            tick_data.get("warden_snr_db"),
            tick_data.get("secrecy_capacity"),
            is_secure_int,
            use_reflection_int,
            tick_data.get("reflection_point_x"),
            tick_data.get("reflection_point_y"),
            tick_data.get("direct_secrecy_capacity"),
            tick_data.get("reflected_secrecy_capacity"),
            los_warden_int,
            los_rx_int,
        )

        cursor = self.conn.cursor()
        cursor.execute(query, params)
        self.conn.commit()

    def get_session_summary(self) -> Dict[str, Any]:
        """Return summary statistics for the current simulation session."""
        query = """
        SELECT 
            COUNT(*),
            SUM(CASE WHEN is_secure = 1 THEN 1 ELSE 0 END),
            SUM(CASE WHEN is_secure = 0 THEN 1 ELSE 0 END),
            SUM(CASE WHEN use_reflection = 1 THEN 1 ELSE 0 END),
            AVG(secrecy_capacity),
            AVG(rx_snr_db),
            AVG(warden_snr_db)
        FROM simulation_ticks
        WHERE session_id = ?;
        """
        cursor = self.conn.cursor()
        cursor.execute(query, (self.session_id,))
        row = cursor.fetchone()

        total_ticks = row[0] if row and row[0] is not None else 0
        secure_ticks = row[1] if row and row[1] is not None else 0
        compromised_ticks = row[2] if row and row[2] is not None else 0
        reflection_used_ticks = row[3] if row and row[3] is not None else 0
        avg_secrecy_capacity = float(row[4]) if row and row[4] is not None else 0.0
        avg_rx_snr_db = float(row[5]) if row and row[5] is not None else 0.0
        avg_warden_snr_db = float(row[6]) if row and row[6] is not None else 0.0

        return {
            "session_id": self.session_id,
            "total_ticks": int(total_ticks),
            "secure_ticks": int(secure_ticks),
            "compromised_ticks": int(compromised_ticks),
            "reflection_used_ticks": int(reflection_used_ticks),
            "avg_secrecy_capacity": avg_secrecy_capacity,
            "avg_rx_snr_db": avg_rx_snr_db,
            "avg_warden_snr_db": avg_warden_snr_db,
        }

    def close(self) -> None:
        """Close the SQLite database connection."""
        if self.conn:
            self.conn.close()
