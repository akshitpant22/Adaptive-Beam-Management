import React, { useState, useEffect } from "react";
import { Stage, Layer, Rect, Circle, Text, Line, Shape } from "react-konva";

// ── Interfaces (unchanged) ──────────────────────────────────────
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
  optimal_direction: number;
  optimal_width: number;
  rx_snr_db: number;
  warden_snr_db: number;
  secrecy_capacity: number;
  is_secure: boolean;
  use_reflection?: boolean;
  reflection_point_x?: number | null;
  reflection_point_y?: number | null;
  direct_secrecy_capacity?: number;
  reflected_secrecy_capacity?: number;
  bs_to_warden_los?: boolean;
  bs_to_rx_los?: boolean;
  warden_blocked?: boolean;
  rx_blocked?: boolean;
}

// ── Design Tokens ───────────────────────────────────────────────
const C = {
  bg: "#0f1418",
  panel: "#1b2024",
  card: "#1e293b",
  border: "#3e484f",
  cyan: "#38bdf8",
  text1: "#dee3e8",
  text2: "#bdc8d1",
  green: "#4ade80",
  red: "#f87171",
  yellow: "#eab308",
  purple: "#ddb7ff",
  orange: "#fb8c00",
  mapBg: "#1b2f3a",
  road: "#1e2d38",
  building: "#252b2e",
};

const F = {
  sans: "'Inter', sans-serif",
  mono: "'JetBrains Mono', monospace",
};

// ── Camera positions ────────────────────────────────────────────
const CAMERAS = [
  { x: 222, y: 222 },
  { x: 522, y: 222 },
  { x: 222, y: 472 },
  { x: 522, y: 472 },
];

const CANVAS_W = 750;
const CANVAS_H = 620;

const App: React.FC = () => {
  const [environment, setEnvironment] = useState<EnvironmentData | null>(null);
  const [currentTick, setCurrentTick] = useState<TickData | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>("Connecting...");
  const [trail, setTrail] = useState<{ x: number; y: number }[]>([]);
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);
  const [diagOpen, setDiagOpen] = useState(false);
  const [exportHover, setExportHover] = useState(false);

  const scaleX = (x: number) => (x / 1000) * CANVAS_W;
  const scaleY = (y: number) => (y / 1000) * CANVAS_H;

  const teleportWarden = async (x: number, y: number) => {
    try {
      await fetch("http://127.0.0.1:8000/warden/position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x, y }),
      });
    } catch (err) {
      console.error("Failed to teleport warden:", err);
    }
  };

  // ── Effects (unchanged) ─────────────────────────────────────
  useEffect(() => {
    fetch("http://127.0.0.1:8000/environment")
      .then((res) => res.json())
      .then((data: EnvironmentData) => setEnvironment(data))
      .catch((err) => console.error("Failed to fetch environment layout:", err));

    const ws = new WebSocket("ws://127.0.0.1:8000/ws/simulation");
    ws.onopen = () => setConnectionStatus("Connected");
    ws.onmessage = (event) => {
      try {
        setCurrentTick(JSON.parse(event.data));
      } catch (err) {
        console.error("Failed to parse WebSocket tick data:", err);
      }
    };
    ws.onerror = () => setConnectionStatus("Error");
    ws.onclose = () => setConnectionStatus("Disconnected");
    return () => ws.close();
  }, []);

  useEffect(() => {
    if (currentTick) {
      setTrail((prev) => [
        ...prev.slice(-49),
        { x: scaleX(currentTick.true_x), y: scaleY(currentTick.true_y) },
      ]);
    }
  }, [currentTick]);

  // ── Helpers ─────────────────────────────────────────────────
  const tickHex = currentTick ? `0x${currentTick.tick.toString(16).toUpperCase().padStart(4, "0")}` : "0x0000";

  const metricRow = (label: string, value: string, color: string) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.border}22` }}>
      <span style={{ fontFamily: F.sans, fontSize: "11px", color: C.text2, fontWeight: 500, letterSpacing: "0.4px" }}>{label}</span>
      <span style={{ fontFamily: F.mono, fontSize: "12px", color, fontWeight: 600 }}>{value}</span>
    </div>
  );

  const sectionBlock = (icon: string, title: string, children: React.ReactNode) => (
    <div style={{ marginBottom: "16px" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: "6px",
        paddingBottom: "6px", marginBottom: "4px",
        borderBottom: `1px solid ${C.border}`,
      }}>
        <span style={{ fontSize: "13px" }}>{icon}</span>
        <span style={{ fontFamily: F.sans, fontSize: "10px", fontWeight: 700, color: C.text2, letterSpacing: "1.5px", textTransform: "uppercase" as const }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );

  const scenarioBtn = (id: string, label: string, x: number, y: number) => (
    <button
      key={id}
      style={{
        backgroundColor: hoveredBtn === id ? C.cyan + "22" : "transparent",
        color: C.cyan,
        border: `1px solid ${C.cyan}55`,
        borderRadius: "4px",
        padding: "3px 8px",
        cursor: "pointer",
        fontSize: "9px",
        fontFamily: F.mono,
        fontWeight: 500,
        transition: "all 0.15s ease",
      }}
      onMouseEnter={() => setHoveredBtn(id)}
      onMouseLeave={() => setHoveredBtn(null)}
      onClick={(e) => { e.stopPropagation(); teleportWarden(x, y); }}
    >
      {label}
    </button>
  );

  const handleExport = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8000/simulation/summary");
      const data = await res.json();
      console.log("Telemetry export:", data);
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  // ── Render ──────────────────────────────────────────────────
  return (
    <>
    <style>{`
      [data-sidebar="true"]::-webkit-scrollbar {
        width: 4px;
      }
      [data-sidebar="true"]::-webkit-scrollbar-track {
        background: transparent;
      }
      [data-sidebar="true"]::-webkit-scrollbar-thumb {
        background: #38bdf8;
        border-radius: 2px;
      }
      [data-sidebar="true"]::-webkit-scrollbar-thumb:hover {
        background: #7dd3fc;
      }
      * {
        box-sizing: border-box;
      }
    `}</style>
    <div style={{
      margin: 0, padding: 0, backgroundColor: C.bg, minHeight: "100vh",
      fontFamily: F.sans, color: C.text1,
      display: "flex", flexDirection: "column",
    }}>
      {/* ── Navbar ────────────────────────────────────────────── */}
      <div style={{
        height: "48px", backgroundColor: C.panel, borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "15px" }}>📡</span>
          <span style={{ fontFamily: F.mono, fontSize: "14px", fontWeight: 700, color: C.cyan, letterSpacing: "1.5px" }}>
            SEC-SIM WIRELESS
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontFamily: F.mono, fontSize: "9px", color: C.text2, letterSpacing: "1px" }}>SCENARIOS:</span>
          {scenarioBtn("direct", "Direct Path", 500, 450)}
          {scenarioBtn("building", "Behind Bldg", 350, 350)}
          {scenarioBtn("receiver", "Near RX", 800, 450)}
          {scenarioBtn("clear", "Clear", 500, 100)}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{
            padding: "3px 12px", borderRadius: "12px", fontSize: "11px",
            fontFamily: F.mono, fontWeight: 600,
            backgroundColor: connectionStatus === "Connected" ? C.green + "18" : C.red + "18",
            color: connectionStatus === "Connected" ? C.green : C.red,
            border: `1px solid ${connectionStatus === "Connected" ? C.green + "44" : C.red + "44"}`,
          }}>
            WS: {connectionStatus === "Connected" ? "CONNECTED" : "DISCONNECTED"}
          </div>
          <span style={{ fontSize: "16px", cursor: "pointer", opacity: 0.5 }}>⚙</span>
          <span style={{ fontSize: "16px", cursor: "pointer", opacity: 0.5 }}>👤</span>
        </div>
      </div>

      {/* ── Status Header ─────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 24px",
        backgroundColor: currentTick
          ? (currentTick.is_secure ? "#166534" : "#991b1b")
          : C.panel,
        borderBottom: `1px solid ${C.border}`,
        transition: "background-color 0.15s ease",
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontFamily: F.sans, fontSize: "10px", color: "#ffffff88", letterSpacing: "1px", marginBottom: "2px" }}>SYSTEM STATUS</div>
          <div style={{ fontFamily: F.mono, fontSize: "20px", fontWeight: 700, color: "#fff" }}>
            {currentTick ? (currentTick.is_secure ? "SECURE ✓" : "COMPROMISED ✗") : "INITIALIZING..."}
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: F.sans, fontSize: "10px", color: "#ffffff88", letterSpacing: "1px", marginBottom: "2px" }}>SIGNAL MODE</div>
          <div style={{ fontFamily: F.mono, fontSize: "16px", fontWeight: 600, color: currentTick?.use_reflection ? C.yellow : C.cyan, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {currentTick?.use_reflection && (
              <span style={{
                width: "8px", height: "8px", borderRadius: "50%",
                backgroundColor: "#eab308",
                display: "inline-block", marginRight: "6px",
                boxShadow: "0 0 0 4px rgba(234,179,8,0.2)"
              }} />
            )}
            {currentTick ? (currentTick.use_reflection ? "⟳ REFLECTION ACTIVE" : "→ DIRECT PATH") : "—"}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: F.sans, fontSize: "10px", color: "#ffffff88", letterSpacing: "1px", marginBottom: "2px" }}>CAPACITY</div>
          <div style={{ fontFamily: F.mono, fontSize: "22px", fontWeight: 700, color: "#fff" }}>
            {currentTick ? currentTick.secrecy_capacity.toFixed(2) : "—"}
            <span style={{ fontSize: "12px", fontWeight: 400, marginLeft: "4px", opacity: 0.7 }}>bps/Hz</span>
          </div>
        </div>
      </div>

      {/* ── Main Area ─────────────────────────────────────────── */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "row",
        padding: "16px 24px", gap: "16px",
        overflow: "hidden",
      }}>
        {/* ── Left: Canvas ─────────────────────────────────────── */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div style={{
            border: `1px solid ${C.border}`, borderRadius: "8px",
            overflow: "hidden", width: CANVAS_W, height: CANVAS_H,
          }}>
            <Stage
              width={CANVAS_W}
              height={CANVAS_H}
              onClick={(e) => {
                const stage = e.target.getStage();
                if (!stage) return;
                const pos = stage.getPointerPosition();
                if (!pos) return;
                teleportWarden((pos.x / CANVAS_W) * 1000, (pos.y / CANVAS_H) * 1000);
              }}
            >
              <Layer>
                {/* Background */}
                <Rect width={CANVAS_W} height={CANVAS_H} fill={C.mapBg} />

                {/* Horizontal Roads */}
                <Rect x={0} y={scaleY(185)} width={CANVAS_W} height={scaleY(75)} fill={C.road} />
                <Rect x={0} y={scaleY(435)} width={CANVAS_W} height={scaleY(75)} fill={C.road} />
                <Rect x={0} y={scaleY(685)} width={CANVAS_W} height={scaleY(75)} fill={C.road} />

                {/* Vertical Roads */}
                <Rect x={scaleX(185)} y={0} width={scaleX(75)} height={CANVAS_H} fill={C.road} />
                <Rect x={scaleX(485)} y={0} width={scaleX(75)} height={CANVAS_H} fill={C.road} />
                <Rect x={scaleX(735)} y={0} width={scaleX(75)} height={CANVAS_H} fill={C.road} />

                {/* Road center lines */}
                <Line points={[0, scaleY(222.5), CANVAS_W, scaleY(222.5)]} stroke="#ffffff" strokeWidth={1} dash={[10, 14]} opacity={0.18} />
                <Line points={[0, scaleY(472.5), CANVAS_W, scaleY(472.5)]} stroke="#ffffff" strokeWidth={1} dash={[10, 14]} opacity={0.18} />
                <Line points={[0, scaleY(722.5), CANVAS_W, scaleY(722.5)]} stroke="#ffffff" strokeWidth={1} dash={[10, 14]} opacity={0.18} />
                <Line points={[scaleX(222.5), 0, scaleX(222.5), CANVAS_H]} stroke="#ffffff" strokeWidth={1} dash={[10, 14]} opacity={0.18} />
                <Line points={[scaleX(522.5), 0, scaleX(522.5), CANVAS_H]} stroke="#ffffff" strokeWidth={1} dash={[10, 14]} opacity={0.18} />
                <Line points={[scaleX(772.5), 0, scaleX(772.5), CANVAS_H]} stroke="#ffffff" strokeWidth={1} dash={[10, 14]} opacity={0.18} />

                {/* Buildings */}
                {environment?.buildings.map((b) => {
                  const bx = scaleX(b.x);
                  const by = scaleY(b.y);
                  const bw = scaleX(b.width);
                  const bh = scaleY(b.height);
                  const label = `SEC-${b.id.toString().padStart(2, "0")}`;
                  return (
                    <React.Fragment key={`b-${b.id}`}>
                      <Rect x={bx} y={by} width={bw} height={bh} fill={C.building} stroke={C.border} strokeWidth={1} />
                      <Text
                        x={bx + bw / 2 - 20}
                        y={by + bh / 2 - 5}
                        text={label}
                        fontSize={11}
                        fontFamily="JetBrains Mono"
                        fill={C.cyan}
                        fontStyle="bold"
                      />
                    </React.Fragment>
                  );
                })}

                {/* Beam Cone (Outer + Inner) */}
                {environment?.base_station && currentTick && (
                  <>
                    <Shape
                      sceneFunc={(ctx, shape) => {
                        const bx = scaleX(environment.base_station.x);
                        const by = scaleY(environment.base_station.y);
                        const d = currentTick.optimal_direction;
                        const w = currentTick.optimal_width;
                        const s = ((d - w / 2) * Math.PI) / 180;
                        const e = ((d + w / 2) * Math.PI) / 180;
                        ctx.beginPath();
                        ctx.moveTo(bx, by);
                        ctx.arc(bx, by, 280, s, e, false);
                        ctx.closePath();
                        ctx.fillStrokeShape(shape);
                      }}
                      fill={currentTick.use_reflection ? "rgba(234, 179, 8, 0.08)" : "rgba(56, 189, 248, 0.08)"}
                      stroke={currentTick.use_reflection ? "rgba(234, 179, 8, 0.4)" : "rgba(56, 189, 248, 0.35)"}
                      strokeWidth={1}
                    />
                    <Shape
                      sceneFunc={(ctx, shape) => {
                        const bx = scaleX(environment.base_station.x);
                        const by = scaleY(environment.base_station.y);
                        const d = currentTick.optimal_direction;
                        const w = currentTick.optimal_width / 2;
                        const s = ((d - w / 2) * Math.PI) / 180;
                        const e = ((d + w / 2) * Math.PI) / 180;
                        ctx.beginPath();
                        ctx.moveTo(bx, by);
                        ctx.arc(bx, by, 280, s, e, false);
                        ctx.closePath();
                        ctx.fillStrokeShape(shape);
                      }}
                      fill={currentTick.use_reflection ? "rgba(234, 179, 8, 0.15)" : "rgba(56, 189, 248, 0.15)"}
                    />
                  </>
                )}

                {/* Reflection Path */}
                {currentTick &&
                  currentTick.use_reflection &&
                  currentTick.reflection_point_x != null &&
                  currentTick.reflection_point_y != null &&
                  environment?.base_station &&
                  environment?.receiver && (
                    <>
                      <Line
                        points={[
                          scaleX(environment.base_station.x), scaleY(environment.base_station.y),
                          scaleX(currentTick.reflection_point_x), scaleY(currentTick.reflection_point_y),
                        ]}
                        stroke={C.yellow} strokeWidth={2} dash={[8, 4]}
                      />
                      <Line
                        points={[
                          scaleX(currentTick.reflection_point_x), scaleY(currentTick.reflection_point_y),
                          scaleX(environment.receiver.x), scaleY(environment.receiver.y),
                        ]}
                        stroke={C.yellow} strokeWidth={2} dash={[8, 4]}
                      />
                      <Circle
                        x={scaleX(currentTick.reflection_point_x)}
                        y={scaleY(currentTick.reflection_point_y)}
                        radius={18} fill="transparent" stroke="#eab308" strokeWidth={1} opacity={0.5}
                      />
                      <Circle
                        x={scaleX(currentTick.reflection_point_x)}
                        y={scaleY(currentTick.reflection_point_y)}
                        radius={10} fill={C.yellow} stroke="#000" strokeWidth={1}
                      />
                      <Text
                        x={scaleX(currentTick.reflection_point_x) + 12}
                        y={scaleY(currentTick.reflection_point_y) - 6}
                        text="R" fill={C.yellow} fontSize={13} fontStyle="bold" fontFamily="JetBrains Mono"
                      />
                    </>
                  )}

                {/* LOS Line to Warden */}
                {currentTick && environment?.base_station && currentTick.bs_to_warden_los && (
                  <Line
                    points={[
                      scaleX(environment.base_station.x), scaleY(environment.base_station.y),
                      scaleX(currentTick.true_x), scaleY(currentTick.true_y),
                    ]}
                    stroke={C.red} strokeWidth={1} dash={[4, 4]} opacity={0.4}
                  />
                )}

                {/* Camera Sensors */}
                {CAMERAS.map((cam, i) => {
                  const cx = scaleX(cam.x);
                  const cy = scaleY(cam.y);
                  const ang = Math.atan2(scaleY(500) - cy, scaleX(500) - cx);
                  return (
                    <React.Fragment key={`cam-${i}`}>
                      <Shape
                        sceneFunc={(ctx, shape) => {
                          const spread = (40 * Math.PI) / 180;
                          ctx.beginPath();
                          ctx.moveTo(cx, cy);
                          ctx.arc(cx, cy, 40, ang - spread / 2, ang + spread / 2, false);
                          ctx.closePath();
                          ctx.fillStrokeShape(shape);
                        }}
                        fill="rgba(250, 204, 21, 0.12)"
                        stroke="rgba(250, 204, 21, 0.3)"
                        strokeWidth={1}
                      />
                      <Circle x={cx} y={cy} radius={4} fill="#374151" stroke="#6b7280" strokeWidth={1} />
                      <Text x={cx - 8} y={cy + 6} text="CAM" fontSize={7} fill={C.yellow} fontFamily="JetBrains Mono" opacity={0.7} />
                    </React.Fragment>
                  );
                })}

                {/* Base Station */}
                {environment?.base_station && (() => {
                  const bx = scaleX(environment.base_station.x);
                  const by = scaleY(environment.base_station.y);
                  return (
                    <>
                      <Circle x={bx} y={by} radius={60} fill="transparent" stroke={C.cyan} strokeWidth={1} opacity={0.1} />
                      <Circle x={bx} y={by} radius={40} fill="transparent" stroke={C.cyan} strokeWidth={1} opacity={0.2} />
                      <Circle x={bx} y={by} radius={22} fill="transparent" stroke={C.cyan} strokeWidth={1} opacity={0.4} />
                      <Shape
                        sceneFunc={(ctx, shape) => {
                          ctx.beginPath();
                          ctx.moveTo(bx, by - 14);
                          ctx.lineTo(bx - 9, by + 12);
                          ctx.lineTo(bx + 9, by + 12);
                          ctx.closePath();
                          ctx.fillStrokeShape(shape);
                        }}
                        fill={C.cyan + "44"}
                        stroke={C.cyan}
                        strokeWidth={1}
                      />
                      <Rect x={bx - 1.5} y={by - 22} width={3} height={9} fill={C.cyan} />
                      <Text x={bx - 25} y={by + 16} text="TX-ALPHA" fontSize={9} fontStyle="bold" fill={C.cyan} fontFamily="JetBrains Mono" />
                    </>
                  );
                })()}

                {/* Receiver */}
                {environment?.receiver && (() => {
                  const rx = scaleX(environment.receiver.x);
                  const ry = scaleY(environment.receiver.y);
                  return (
                    <>
                      <Circle x={rx} y={ry} radius={60} fill="transparent" stroke={C.cyan} strokeWidth={1} opacity={0.1} />
                      <Circle x={rx} y={ry} radius={40} fill="transparent" stroke={C.cyan} strokeWidth={1} opacity={0.2} />
                      <Circle x={rx} y={ry} radius={22} fill="transparent" stroke={C.cyan} strokeWidth={1} opacity={0.4} />
                      <Circle x={rx} y={ry} radius={8} fill={C.cyan + "33"} stroke={C.cyan} strokeWidth={2} />
                      {/* Label pill */}
                      <Rect x={rx - 30} y={ry - 26} width={60} height={16} fill="#0f1418cc" cornerRadius={8} stroke={C.cyan + "55"} strokeWidth={1} />
                      <Text x={rx - 26} y={ry - 23} text="RX-BRAVO" fontSize={8} fontStyle="bold" fill={C.cyan} fontFamily="JetBrains Mono" />
                    </>
                  );
                })()}

                {/* Warden Trail */}
                {trail.map((pt, i) => (
                  <Circle key={`t-${i}`} x={pt.x} y={pt.y} radius={2} fill={C.red} opacity={(i + 1) / trail.length * 0.5} />
                ))}

                {/* Noisy Measurement */}
                {currentTick && (
                  <Circle x={scaleX(currentTick.noisy_x)} y={scaleY(currentTick.noisy_y)} radius={4} fill={C.orange} opacity={0.8} />
                )}

                {/* Kalman Filtered */}
                {currentTick && (
                  <Circle x={scaleX(currentTick.filtered_x)} y={scaleY(currentTick.filtered_y)} radius={5} fill={C.purple} opacity={0.8} />
                )}

                {/* True Warden */}
                {(() => {
                  const wx = scaleX(currentTick ? currentTick.true_x : environment?.warden.x ?? 200);
                  const wy = scaleY(currentTick ? currentTick.true_y : environment?.warden.y ?? 100);
                  return (
                    <>
                      <Circle x={wx} y={wy} radius={16} fill="transparent" stroke={C.red} strokeWidth={1} opacity={0.35} />
                      <Circle x={wx} y={wy} radius={9} fill={C.red} stroke="#000" strokeWidth={2} />
                      {currentTick && (currentTick.vx_estimated !== 0 || currentTick.vy_estimated !== 0) && (() => {
                        const mag = Math.sqrt(currentTick.vx_estimated ** 2 + currentTick.vy_estimated ** 2);
                        if (mag < 0.01) return null;
                        const nx = currentTick.vx_estimated / mag;
                        const ny = currentTick.vy_estimated / mag;
                        return (
                          <Line
                            points={[wx, wy, wx + nx * 20, wy + ny * 20 * 0.6]}
                            stroke="#ff6b6b" strokeWidth={2}
                          />
                        );
                      })()}
                      {/* Label pill */}
                      <Rect x={wx + 12} y={wy - 9} width={42} height={16} fill="#0f1418cc" cornerRadius={8} stroke={C.red + "55"} strokeWidth={1} />
                      <Text x={wx + 16} y={wy - 6} text="TOT-01" fontSize={8} fontStyle="bold" fill={C.red} fontFamily="JetBrains Mono" />
                    </>
                  );
                })()}

                {/* Coordinate corners */}
                <Text x={6} y={4} text="[0, 1000]" fontSize={9} fill={C.text2} fontFamily="JetBrains Mono" opacity={0.5} />
                <Text x={6} y={CANVAS_H - 14} text="[0, 0]" fontSize={9} fill={C.text2} fontFamily="JetBrains Mono" opacity={0.5} />
                <Text x={CANVAS_W - 58} y={CANVAS_H - 14} text="[1000, 0]" fontSize={9} fill={C.text2} fontFamily="JetBrains Mono" opacity={0.5} />

                {/* Scale bar */}
                <Line points={[CANVAS_W - 100, CANVAS_H - 20, CANVAS_W - 25, CANVAS_H - 20]} stroke={C.cyan} strokeWidth={2} />
                <Text x={CANVAS_W - 96} y={CANVAS_H - 34} text="100m SCALE" fontSize={8} fill={C.cyan} fontFamily="JetBrains Mono" opacity={0.6} />

                {/* Reflection Active Overlay Banner */}
                {currentTick?.use_reflection && (
                  <>
                    <Rect
                      x={0}
                      y={0}
                      width={CANVAS_W}
                      height={24}
                      fill="rgba(234, 179, 8, 0.15)"
                      stroke="#eab308"
                      strokeWidth={1}
                    />
                    <Text
                      x={CANVAS_W / 2 - 80}
                      y={6}
                      text="⟳ REFLECTION PATH ACTIVE"
                      fontSize={11}
                      fill="#eab308"
                      fontStyle="bold"
                      fontFamily="JetBrains Mono"
                    />
                  </>
                )}

              </Layer>
            </Stage>
          </div>


        </div>

        {/* ── Right: Metrics Sidebar ───────────────────────────── */}
        <div data-sidebar="true" style={{
          width: "320px", flexShrink: 0,
          backgroundColor: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: "8px",
          padding: "16px",
          overflowY: "auto" as const,
          height: `${CANVAS_H}px`,
          maxHeight: `${CANVAS_H}px`,
        }}>
          {/* Header */}
          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontFamily: F.sans, fontSize: "15px", fontWeight: 700, color: C.text1 }}>Simulation Metrics</div>
            <div style={{ fontFamily: F.mono, fontSize: "11px", color: C.text2 + "88", marginTop: "2px" }}>
              Active Session: {tickHex}
            </div>
          </div>

          {/* POSITIONAL TRACKING */}
          {sectionBlock("📍", "Positional Tracking", <>
            {metricRow("THREAT POS (X,Y)",
              currentTick ? `${currentTick.true_x.toFixed(1)}, ${currentTick.true_y.toFixed(1)}` : "—", C.red)}
            {metricRow("KALMAN EST (X,Y)",
              currentTick ? `${currentTick.filtered_x.toFixed(1)}, ${currentTick.filtered_y.toFixed(1)}` : "—", C.purple)}
            {metricRow("NOISY POS (X,Y)",
              currentTick ? `${currentTick.noisy_x.toFixed(1)}, ${currentTick.noisy_y.toFixed(1)}` : "—", C.orange)}
            {metricRow("EST VELOCITY",
              currentTick ? `${currentTick.vx_estimated.toFixed(2)}, ${currentTick.vy_estimated.toFixed(2)}` : "—", C.cyan)}
          </>)}

          {/* SIGNAL INTELLIGENCE */}
          {sectionBlock("📶", "Signal Intelligence", <>
            {metricRow("TX BEAM ANGLE",
              currentTick ? `${currentTick.optimal_direction.toFixed(1)}°` : "—", C.cyan)}
            {metricRow("BEAM WIDTH",
              currentTick ? `${currentTick.optimal_width.toFixed(1)}°` : "—", C.cyan)}
            {metricRow("RX SNR",
              currentTick ? `${currentTick.rx_snr_db.toFixed(1)} dB` : "—", C.green)}
            {metricRow("WARDEN SNR",
              currentTick ? `${currentTick.warden_snr_db.toFixed(1)} dB` : "—", C.red)}
            {metricRow("REFL PATH LOSS",
              currentTick?.reflected_secrecy_capacity != null ? `${currentTick.reflected_secrecy_capacity.toFixed(2)}` : "—", C.yellow)}
          </>)}

          {/* CYBERSECURITY METRICS */}
          {sectionBlock("🔒", "Cybersecurity Metrics", <>
            {/* Reflection Routing Status Box */}
            {currentTick?.use_reflection ? (
              <div style={{
                backgroundColor: "rgba(234,179,8,0.1)",
                border: "1px solid #eab308",
                borderRadius: "6px",
                padding: "8px",
                marginBottom: "8px",
                fontFamily: F.mono,
                fontSize: "11px",
                color: "#eab308",
                fontWeight: "bold",
                textAlign: "center"
              }}>
                ⟳ REFLECTION ROUTING ACTIVE
              </div>
            ) : (
              <div style={{
                backgroundColor: "rgba(56,189,248,0.08)",
                border: "1px solid #38bdf855",
                borderRadius: "6px",
                padding: "8px",
                marginBottom: "8px",
                fontFamily: F.mono,
                fontSize: "11px",
                color: "#38bdf8",
                textAlign: "center"
              }}>
                → DIRECT PATH ROUTING
              </div>
            )}
            {/* Large secrecy display */}
            <div style={{
              backgroundColor: C.card, borderRadius: "6px", padding: "12px",
              marginBottom: "8px", textAlign: "center",
              border: `1px solid ${C.border}44`,
            }}>
              <div style={{ fontFamily: F.sans, fontSize: "9px", color: C.text2, letterSpacing: "1px", marginBottom: "4px" }}>SECRECY CAPACITY</div>
              <div style={{ fontFamily: F.mono, fontSize: "28px", fontWeight: 700, color: C.purple }}>
                {currentTick ? currentTick.secrecy_capacity.toFixed(2) : "—"}
              </div>
              <div style={{ fontFamily: F.mono, fontSize: "10px", color: C.text2 + "88" }}>bps/Hz</div>
            </div>
            {metricRow("DIRECT SECRECY",
              currentTick?.direct_secrecy_capacity != null ? `${currentTick.direct_secrecy_capacity.toFixed(2)} bps/Hz` : "—", C.purple)}
            {metricRow("REFLECTED SECRECY",
              currentTick?.reflected_secrecy_capacity != null ? `${currentTick.reflected_secrecy_capacity.toFixed(2)} bps/Hz` : "—", C.yellow)}
          </>)}

          {/* LINE OF SIGHT STATUS */}
          {sectionBlock("👁", "Line of Sight Status", <>
            {metricRow("LOS TO WARDEN",
              currentTick ? (currentTick.bs_to_warden_los ? "YES" : "NO") : "—",
              currentTick ? (currentTick.bs_to_warden_los ? C.green : C.red) : C.text2)}
            {metricRow("LOS TO RECEIVER",
              currentTick ? (currentTick.bs_to_rx_los ? "YES" : "NO") : "—",
              currentTick ? (currentTick.bs_to_rx_los ? C.green : C.red) : C.text2)}
            {metricRow("WARDEN BLOCKED",
              currentTick ? (currentTick.warden_blocked ? "YES" : "NO") : "—",
              currentTick ? (currentTick.warden_blocked ? C.green : C.red) : C.text2)}
          </>)}

          {/* EXPORT BUTTON */}
          <button
            onClick={handleExport}
            onMouseEnter={() => setExportHover(true)}
            onMouseLeave={() => setExportHover(false)}
            style={{
              width: "100%", padding: "10px",
              backgroundColor: exportHover ? C.cyan + "22" : "transparent",
              color: C.cyan,
              border: `1px solid ${C.cyan}`,
              borderRadius: "6px",
              fontFamily: F.mono, fontSize: "12px", fontWeight: 600,
              cursor: "pointer", letterSpacing: "1px",
              transition: "all 0.15s ease",
              marginBottom: "12px",
            }}
          >
            EXPORT TELEMETRY
          </button>

          {/* DIAGNOSTICS COLLAPSIBLE */}
          <div>
            <div
              onClick={() => setDiagOpen(!diagOpen)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                cursor: "pointer", padding: "6px 0",
                borderTop: `1px solid ${C.border}`,
              }}
            >
              <span style={{ fontFamily: F.sans, fontSize: "11px", color: C.text2, fontWeight: 600 }}>Diagnostics</span>
              <span style={{ fontSize: "10px", color: C.text2 }}>{diagOpen ? "▲" : "▼"}</span>
            </div>
            {diagOpen && (
              <div style={{ padding: "8px 0" }}>
                {metricRow("TICK", currentTick ? `${currentTick.tick}` : "—", C.text2)}
                {metricRow("WS STATUS", connectionStatus, connectionStatus === "Connected" ? C.green : C.red)}
                {metricRow("BEAM DIR",
                  currentTick ? `${currentTick.optimal_direction.toFixed(1)}°` : "—", C.text2)}
                {metricRow("BEAM WID",
                  currentTick ? `${currentTick.optimal_width.toFixed(1)}°` : "—", C.text2)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
};

export default App;
