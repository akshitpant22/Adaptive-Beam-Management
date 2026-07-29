import React, { useState, useEffect } from "react";
import { Stage, Layer, Rect, Circle, Text, Line } from "react-konva";

interface BuildingData {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BaseStationData {
  x: number;
  y: number;
  tx_power: number;
}

interface ReceiverData {
  x: number;
  y: number;
}

interface WardenData {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface EnvironmentData {
  buildings: BuildingData[];
  base_station: BaseStationData;
  receiver: ReceiverData;
  warden: WardenData;
}

interface TickData {
  tick: number;
  true_x: number;
  true_y: number;
  noisy_x: number;
  noisy_y: number;
  filtered_x: number;
  filtered_y: number;
  vx_estimated: number;
  vy_estimated: number;
}

const App: React.FC = () => {
  const [environment, setEnvironment] = useState<EnvironmentData | null>(null);
  const [currentTick, setCurrentTick] = useState<TickData | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>("Connecting...");
  const [trail, setTrail] = useState<{ x: number; y: number }[]>([]);

  // Coordinate scaling functions from 1000x1000 grid to 1000x700 canvas
  const scaleX = (x: number) => (x / 1000) * 1000;
  const scaleY = (y: number) => (y / 1000) * 700;

  useEffect(() => {
    // 1. Fetch environment layout from HTTP endpoint
    fetch("http://127.0.0.1:8000/environment")
      .then((res) => res.json())
      .then((data: EnvironmentData) => {
        setEnvironment(data);
      })
      .catch((err) => {
        console.error("Failed to fetch environment layout:", err);
      });

    // 2. Connect to WebSocket stream for simulation ticks
    const ws = new WebSocket("ws://127.0.0.1:8000/ws/simulation");

    ws.onopen = () => {
      setConnectionStatus("Connected");
    };

    ws.onmessage = (event) => {
      try {
        const data: TickData = JSON.parse(event.data);
        setCurrentTick(data);
      } catch (err) {
        console.error("Failed to parse WebSocket tick data:", err);
      }
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
      setConnectionStatus("Error");
    };

    ws.onclose = () => {
      setConnectionStatus("Disconnected");
    };

    return () => {
      ws.close();
    };
  }, []);

  // Update trail when a new tick is received
  useEffect(() => {
    if (currentTick) {
      const scaledPoint = {
        x: scaleX(currentTick.true_x),
        y: scaleY(currentTick.true_y),
      };
      setTrail((prev) => [...prev.slice(-49), scaledPoint]);
    }
  }, [currentTick]);

  // Generate grid line coordinates
  const verticalGridLines = Array.from({ length: 9 }, (_, i) => (i + 1) * 100);
  const horizontalGridLines = Array.from({ length: 6 }, (_, i) => (i + 1) * 100);

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif", backgroundColor: "#0f172a", minHeight: "100vh", color: "#f8fafc" }}>
      <h2 style={{ marginBottom: "5px", color: "#38bdf8" }}>
        Adaptive Beam Management — Phase 1: Warden Tracking
      </h2>
      <p style={{ marginTop: "0", marginBottom: "15px", color: "#94a3b8" }}>
        WebSocket Status: <strong style={{ color: connectionStatus === "Connected" ? "#4ade80" : "#f87171" }}>{connectionStatus}</strong>
      </p>

      {/* 2D Canvas Stage */}
      <div style={{ border: "2px solid #334155", width: 1000, height: 700, borderRadius: "8px", overflow: "hidden" }}>
        <Stage width={1000} height={700}>
          <Layer>
            {/* Background Rect */}
            <Rect width={1000} height={700} fill="#f0f4f8" />

            {/* Grid Lines */}
            {verticalGridLines.map((x) => (
              <Line key={`v-${x}`} points={[x, 0, x, 700]} stroke="#e0e0e0" strokeWidth={1} />
            ))}
            {horizontalGridLines.map((y) => (
              <Line key={`h-${y}`} points={[0, y, 1000, y]} stroke="#e0e0e0" strokeWidth={1} />
            ))}

            {/* Render Buildings */}
            {environment?.buildings.map((b) => (
              <Rect
                key={b.id}
                x={scaleX(b.x)}
                y={scaleY(b.y)}
                width={scaleX(b.width)}
                height={scaleY(b.height)}
                fill="#7f8c8d"
                stroke="#34495e"
                strokeWidth={1}
              />
            ))}

            {/* Render Base Station */}
            {environment?.base_station && (
              <>
                <Circle
                  x={scaleX(environment.base_station.x)}
                  y={scaleY(environment.base_station.y)}
                  radius={10}
                  fill="#1e88e5"
                />
                <Text
                  x={scaleX(environment.base_station.x) + 12}
                  y={scaleY(environment.base_station.y) - 6}
                  text="BS"
                  fontSize={14}
                  fontStyle="bold"
                  fill="#1e88e5"
                />
              </>
            )}

            {/* Render Receiver */}
            {environment?.receiver && (
              <>
                <Circle
                  x={scaleX(environment.receiver.x)}
                  y={scaleY(environment.receiver.y)}
                  radius={10}
                  fill="#4caf50"
                />
                <Text
                  x={scaleX(environment.receiver.x) + 12}
                  y={scaleY(environment.receiver.y) - 6}
                  text="RX"
                  fontSize={14}
                  fontStyle="bold"
                  fill="#4caf50"
                />
              </>
            )}

            {/* Render Warden Motion Trail */}
            {trail.map((point, index) => (
              <Circle
                key={`trail-${index}`}
                x={point.x}
                y={point.y}
                radius={2}
                fill="#ffcccc"
              />
            ))}

            {/* Render Noisy Measurement */}
            {currentTick && (
              <>
                <Circle
                  x={scaleX(currentTick.noisy_x)}
                  y={scaleY(currentTick.noisy_y)}
                  radius={5}
                  fill="#fb8c00"
                />
                <Text
                  x={scaleX(currentTick.noisy_x) + 8}
                  y={scaleY(currentTick.noisy_y) - 4}
                  text="N"
                  fontSize={11}
                  fill="#fb8c00"
                />
              </>
            )}

            {/* Render Kalman Filtered Position */}
            {currentTick && (
              <>
                <Circle
                  x={scaleX(currentTick.filtered_x)}
                  y={scaleY(currentTick.filtered_y)}
                  radius={8}
                  fill="#8e24aa"
                />
                <Text
                  x={scaleX(currentTick.filtered_x) + 10}
                  y={scaleY(currentTick.filtered_y) - 5}
                  text="K"
                  fontSize={12}
                  fontStyle="bold"
                  fill="#8e24aa"
                />
              </>
            )}

            {/* Render True Warden Position */}
            {currentTick ? (
              <>
                <Circle
                  x={scaleX(currentTick.true_x)}
                  y={scaleY(currentTick.true_y)}
                  radius={8}
                  fill="#e53935"
                />
                <Text
                  x={scaleX(currentTick.true_x) + 10}
                  y={scaleY(currentTick.true_y) - 5}
                  text="W"
                  fontSize={12}
                  fontStyle="bold"
                  fill="#e53935"
                />
              </>
            ) : (
              environment?.warden && (
                <>
                  <Circle
                    x={scaleX(environment.warden.x)}
                    y={scaleY(environment.warden.y)}
                    radius={8}
                    fill="#e53935"
                  />
                  <Text
                    x={scaleX(environment.warden.x) + 10}
                    y={scaleY(environment.warden.y) - 5}
                    text="W"
                    fontSize={12}
                    fontStyle="bold"
                    fill="#e53935"
                  />
                </>
              )
            )}

            {/* Legend Box */}
            <Rect
              x={810}
              y={15}
              width={175}
              height={135}
              fill="rgba(255, 255, 255, 0.92)"
              stroke="#cbd5e1"
              strokeWidth={1}
              cornerRadius={6}
            />
            {/* Legend Items */}
            <Circle x={825} y={32} radius={6} fill="#1e88e5" />
            <Text x={840} y={26} text="Base Station" fontSize={12} fill="#334155" />

            <Circle x={825} y={54} radius={6} fill="#4caf50" />
            <Text x={840} y={48} text="Receiver" fontSize={12} fill="#334155" />

            <Circle x={825} y={76} radius={6} fill="#e53935" />
            <Text x={840} y={70} text="Warden (True)" fontSize={12} fill="#334155" />

            <Circle x={825} y={98} radius={5} fill="#fb8c00" />
            <Text x={840} y={92} text="Noisy Sensor" fontSize={12} fill="#334155" />

            <Circle x={825} y={120} radius={6} fill="#8e24aa" />
            <Text x={840} y={114} text="Kalman Filter" fontSize={12} fill="#334155" />
          </Layer>
        </Stage>
      </div>

      {/* Styled Stats Panel */}
      <div
        style={{
          marginTop: "15px",
          padding: "15px",
          backgroundColor: "#1a1a2e",
          color: "#ffffff",
          borderRadius: "8px",
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          gap: "12px",
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3)",
          width: "970px",
        }}
      >
        <div style={{ flex: 1, padding: "10px", backgroundColor: "#16213e", border: "1px solid #33334d", borderRadius: "6px" }}>
          <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>TICK</div>
          <div style={{ fontSize: "18px", fontWeight: "bold", color: "#38bdf8" }}>
            {currentTick ? currentTick.tick : "—"}
          </div>
        </div>

        <div style={{ flex: 1, padding: "10px", backgroundColor: "#16213e", border: "1px solid #33334d", borderRadius: "6px" }}>
          <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>TRUE POSITION</div>
          <div style={{ fontSize: "14px", fontWeight: "bold", color: "#f87171" }}>
            {currentTick ? `(${currentTick.true_x.toFixed(1)}, ${currentTick.true_y.toFixed(1)})` : "—"}
          </div>
        </div>

        <div style={{ flex: 1, padding: "10px", backgroundColor: "#16213e", border: "1px solid #33334d", borderRadius: "6px" }}>
          <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>NOISY POSITION</div>
          <div style={{ fontSize: "14px", fontWeight: "bold", color: "#fb923c" }}>
            {currentTick ? `(${currentTick.noisy_x.toFixed(1)}, ${currentTick.noisy_y.toFixed(1)})` : "—"}
          </div>
        </div>

        <div style={{ flex: 1, padding: "10px", backgroundColor: "#16213e", border: "1px solid #33334d", borderRadius: "6px" }}>
          <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>KALMAN POSITION</div>
          <div style={{ fontSize: "14px", fontWeight: "bold", color: "#c084fc" }}>
            {currentTick ? `(${currentTick.filtered_x.toFixed(1)}, ${currentTick.filtered_y.toFixed(1)})` : "—"}
          </div>
        </div>

        <div style={{ flex: 1, padding: "10px", backgroundColor: "#16213e", border: "1px solid #33334d", borderRadius: "6px" }}>
          <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>EST. VELOCITY</div>
          <div style={{ fontSize: "14px", fontWeight: "bold", color: "#4ade80" }}>
            {currentTick ? `(${currentTick.vx_estimated.toFixed(2)}, ${currentTick.vy_estimated.toFixed(2)})` : "—"}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
