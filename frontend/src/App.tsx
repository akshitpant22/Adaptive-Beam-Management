import React, { useState, useEffect } from "react";
import { Stage, Layer, Rect, Circle, Text, Line, Shape } from "react-konva";

// ── Interfaces ──────────────────────────────────────────────────
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
  bg: "#0b0f14",
  panel: "#121820",
  panelAlt: "#182230",
  card: "#161e28",
  border: "#243242",
  borderActive: "#38bdf8",
  cyan: "#38bdf8",
  text1: "#f1f5f9",
  text2: "#94a3b8",
  textMuted: "#64748b",
  green: "#22c55e",
  greenBg: "#14532d",
  red: "#ef4444",
  redBg: "#7f1d1d",
  yellow: "#eab308",
  purple: "#c084fc",
  orange: "#f97316",
  mapBg: "#0f1722",
  road: "#16202c",
  building: "#1e293b",
};

const F = {
  sans: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', monospace",
};

// ── Camera positions ────────────────────────────────────────────
const CAMERAS = [
  { x: 222, y: 222 },
  { x: 522, y: 222 },
  { x: 222, y: 472 },
  { x: 522, y: 472 },
];

const CANVAS_W = 760;
const CANVAS_H = 590;

const App: React.FC = () => {
  const [environment, setEnvironment] = useState<EnvironmentData | null>(null);
  const [currentTick, setCurrentTick] = useState<TickData | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>("Connecting...");
  const [trail, setTrail] = useState<{ x: number; y: number }[]>([]);
  const [activeScenario, setActiveScenario] = useState<string | null>("direct");
  const [exportToast, setExportToast] = useState(false);
  const [activeView, setActiveView] = useState<"beam" | "metrics">("beam");

  const scaleX = (x: number) => (x / 1000) * CANVAS_W;
  const scaleY = (y: number) => (y / 1000) * CANVAS_H;

  const teleportWarden = async (x: number, y: number, scenarioId?: string) => {
    if (scenarioId) setActiveScenario(scenarioId);
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

  // ── Effects ─────────────────────────────────────────────────
  useEffect(() => {
    fetch("http://127.0.0.1:8000/environment")
      .then((res) => res.json())
      .then((data: EnvironmentData) => setEnvironment(data))
      .catch((err) => console.error("Failed to fetch environment layout:", err));

    let timer: ReturnType<typeof setTimeout> | null = null;
    let ws: WebSocket | null = null;
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      ws = new WebSocket("ws://127.0.0.1:8000/ws/simulation");
      ws.onopen = () => setConnectionStatus("Connected");
      ws.onmessage = (event) => {
        try {
          setCurrentTick(JSON.parse(event.data));
        } catch (err) {
          console.error("Failed to parse WebSocket tick data:", err);
        }
      };
      ws.onerror = () => setConnectionStatus("Error");
      ws.onclose = () => {
        if (stopped) return;
        setConnectionStatus("Disconnected");
        timer = setTimeout(connect, 2000);
      };
    };

    connect();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, []);

  useEffect(() => {
    if (currentTick) {
      setTrail((prev) => [
        ...prev.slice(-49),
        { x: scaleX(currentTick.true_x), y: scaleY(currentTick.true_y) },
      ]);
    }
  }, [currentTick]);

  // ── Export Telemetry Handler ────────────────────────────────
  const handleExport = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8000/simulation/summary");
      const summaryData = await res.json();
      
      const payload = {
        exportedAt: new Date().toISOString(),
        status: connectionStatus,
        activeEnvironment: environment,
        latestTickState: currentTick,
        summary: summaryData,
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sec_sim_telemetry_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportToast(true);
      setTimeout(() => setExportToast(false), 3000);
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  const metricRow = (label: string, value: string, color: string, sub?: string) => (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "7px 0", borderBottom: `1px solid ${C.border}44`
    }}>
      <div>
        <span style={{ fontFamily: F.sans, fontSize: "11px", color: C.text2, fontWeight: 500 }}>{label}</span>
        {sub && <span style={{ fontFamily: F.sans, fontSize: "9px", color: C.textMuted, marginLeft: "6px" }}>{sub}</span>}
      </div>
      <span style={{ fontFamily: F.mono, fontSize: "12px", color, fontWeight: 600 }}>{value}</span>
    </div>
  );

  const sectionCard = (icon: string, title: string, badge: string | null, badgeColor: string, children: React.ReactNode) => (
    <div style={{
      backgroundColor: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: "8px",
      padding: "14px",
      marginBottom: "12px",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        paddingBottom: "8px", marginBottom: "6px",
        borderBottom: `1px solid ${C.border}66`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "13px" }}>{icon}</span>
          <span style={{ fontFamily: F.sans, fontSize: "11px", fontWeight: 700, color: C.text1, letterSpacing: "1px", textTransform: "uppercase" }}>
            {title}
          </span>
        </div>
        {badge && (
          <span style={{
            fontFamily: F.mono, fontSize: "9px", fontWeight: 600,
            padding: "2px 6px", borderRadius: "4px",
            backgroundColor: badgeColor + "22",
            color: badgeColor,
            border: `1px solid ${badgeColor}44`,
          }}>
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );

  const snrDelta = currentTick ? (currentTick.rx_snr_db - currentTick.warden_snr_db).toFixed(1) : "0.0";
  const snrDeltaNum = parseFloat(snrDelta);

  return (
    <>
    <style>{`
      [data-sidebar="true"]::-webkit-scrollbar { width: 4px; }
      [data-sidebar="true"]::-webkit-scrollbar-track { background: transparent; }
      [data-sidebar="true"]::-webkit-scrollbar-thumb { background: #38bdf8; border-radius: 2px; }
      * { box-sizing: border-box; }
    `}</style>
    <div style={{
      margin: 0, padding: 0, backgroundColor: C.bg, minHeight: "100vh",
      fontFamily: F.sans, color: C.text1, display: "flex", flexDirection: "column",
    }}>
      {/* ── Top Bar ────────────────────────────────────────────── */}
      <div style={{
        height: "50px", backgroundColor: C.panel, borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "8px", height: "8px", borderRadius: "50%",
            backgroundColor: C.cyan, flexShrink: 0,
          }} />
          <div>
            <div style={{ fontFamily: F.sans, fontSize: "15px", fontWeight: 700, color: C.text1 }}>
              Adaptive Beam Management
            </div>
            <div style={{ fontFamily: F.sans, fontSize: "10px", color: C.textMuted }}>
              Secure Wireless Communication Simulator
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {exportToast && (
            <span style={{
              fontFamily: F.mono, fontSize: "11px", color: C.green,
              backgroundColor: C.green + "18", border: `1px solid ${C.green}44`,
              padding: "4px 10px", borderRadius: "6px",
            }}>
              ✓ Telemetry Downloaded
            </span>
          )}
          <button
            onClick={handleExport}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "5px 12px", backgroundColor: C.panelAlt,
              color: C.cyan, border: `1px solid ${C.cyan}66`, borderRadius: "6px",
              cursor: "pointer", fontFamily: F.mono, fontSize: "10px", fontWeight: 600,
              transition: "all 0.15s ease",
            }}
          >
            <span>📥</span> EXPORT TELEMETRY (.JSON)
          </button>
          <div style={{
            padding: "4px 10px", borderRadius: "6px", fontSize: "10px",
            fontFamily: F.mono, fontWeight: 700,
            backgroundColor: connectionStatus === "Connected" ? C.green + "18" : C.red + "18",
            color: connectionStatus === "Connected" ? C.green : C.red,
            border: `1px solid ${connectionStatus === "Connected" ? C.green + "44" : C.red + "44"}`,
          }}>
            WS: {connectionStatus === "Connected" ? "CONNECTED" : "DISCONNECTED"}
          </div>
        </div>
      </div>

      {/* ── Status Header Banner ───────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 24px",
        backgroundColor: currentTick ? (currentTick.is_secure ? C.greenBg : C.redBg) : C.panel,
        borderBottom: `1px solid ${C.border}`,
        transition: "background-color 0.2s ease",
        flexShrink: 0,
      }}>
        {/* Left section */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{
            width: "10px", height: "10px", borderRadius: "50%",
            backgroundColor: currentTick?.is_secure ? C.green : C.red,
          }} />
          <span style={{ fontFamily: F.mono, fontSize: "16px", fontWeight: 700, color: "#fff" }}>
            {currentTick ? (currentTick.is_secure ? "SECURE" : "COMPROMISED") : "INITIALIZING..."}
          </span>
        </div>

        {/* Center section */}
        <div>
          <span style={{
            fontFamily: F.mono, fontSize: "13px",
            color: currentTick?.use_reflection ? C.yellow : C.cyan,
          }}>
            {currentTick ? (currentTick.use_reflection ? "⟳ REFLECTION ACTIVE" : "→ DIRECT PATH") : "—"}
          </span>
        </div>

        {/* Right section */}
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
          <span style={{ fontSize: "10px", color: "#ffffffaa" }}>
            Secrecy Capacity
          </span>
          <span style={{ fontFamily: F.mono, fontSize: "18px", fontWeight: 700, color: "#fff" }}>
            {currentTick ? currentTick.secrecy_capacity.toFixed(2) : "0.00"} bps/Hz
          </span>
        </div>
      </div>

      {/* ── Scenario Buttons ─────────────────────────────────── */}
      <div style={{
        backgroundColor: C.panel,
        borderBottom: `1px solid ${C.border}`,
        padding: "10px 24px",
        display: "flex",
        alignItems: "center",
        gap: "10px",
      }}>
        <span style={{ fontSize: "11px", color: C.textMuted }}>Scenarios:</span>
        {[
          { id: "direct", label: "⚡ Direct Path", x: 500, y: 450 },
          { id: "building", label: "🏢 Behind Building", x: 395, y: 235 },
          { id: "receiver", label: "🎯 Near Receiver", x: 850, y: 450 },
          { id: "clear", label: "🌐 Clear Field", x: 515, y: 100 },
        ].map((sc) => {
          const isActive = activeScenario === sc.id;
          return (
            <button
              key={sc.id}
              onClick={() => teleportWarden(sc.x, sc.y, sc.id)}
              style={{
                backgroundColor: isActive ? C.cyan + "22" : C.card,
                color: isActive ? C.cyan : C.text2,
                border: `1px solid ${isActive ? C.cyan : C.border}`,
                borderRadius: "6px",
                padding: "6px 14px",
                fontSize: "12px",
                fontFamily: F.sans,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {sc.label}
            </button>
          );
        })}
      </div>

      {/* ── Main Area (Grid + Sidebar) ─────────────────────────── */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "row",
        padding: "16px 24px", gap: "16px",
      }}>
        {/* ── Left: Digital Twin Canvas ───────────────────────── */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div style={{
            border: `1px solid ${C.border}`, borderRadius: "8px",
            overflow: "hidden", width: CANVAS_W, height: CANVAS_H,
            backgroundColor: C.mapBg,
          }}>
            <Stage
              width={CANVAS_W}
              height={CANVAS_H}
              onClick={(e) => {
                const stage = e.target.getStage();
                if (!stage) return;
                const pos = stage.getPointerPosition();
                if (!pos) return;
                const simX = (pos.x / CANVAS_W) * 1000;
                const simY = (pos.y / CANVAS_H) * 1000;
                teleportWarden(simX, simY);
                setActiveScenario(null);
              }}
            >
              <Layer>
                {/* Background Grid */}
                <Rect x={0} y={0} width={CANVAS_W} height={CANVAS_H} fill={C.mapBg} />

                {/* Grid Lines */}
                {Array.from({ length: 11 }).map((_, i) => (
                  <React.Fragment key={`grid-${i}`}>
                    <Line points={[scaleX(i * 100), 0, scaleX(i * 100), CANVAS_H]} stroke="#1c2d3d" strokeWidth={0.5} dash={[3, 5]} opacity={0.4} />
                    <Line points={[0, scaleY(i * 100), CANVAS_W, scaleY(i * 100)]} stroke="#1c2d3d" strokeWidth={0.5} dash={[3, 5]} opacity={0.4} />
                  </React.Fragment>
                ))}

                {/* Roads */}
                {[25, 235, 490, 840].map((ry, idx) => (
                  <Rect key={`hr-${idx}`} x={0} y={scaleY(ry - 20)} width={CANVAS_W} height={scaleY(40)} fill={C.road} opacity={0.5} />
                ))}
                {[40, 275, 515, 855].map((rx, idx) => (
                  <Rect key={`vr-${idx}`} x={scaleX(rx - 20)} y={0} width={scaleX(40)} height={CANVAS_H} fill={C.road} opacity={0.5} />
                ))}

                {/* Buildings */}
                {environment?.buildings.map((b) => {
                  const bx = scaleX(b.x);
                  const by = scaleY(b.y);
                  const bw = scaleX(b.width);
                  const bh = scaleY(b.height);
                  return (
                    <React.Fragment key={`bldg-${b.id}`}>
                      <Rect x={bx + 3} y={by + 3} width={bw} height={bh} fill="#00000055" cornerRadius={3} />
                      <Rect x={bx} y={by} width={bw} height={bh} fill={C.building} stroke="#3b4a58" strokeWidth={1} cornerRadius={3} />
                      <Text x={bx + bw / 2 - 12} y={by + bh / 2 - 5} text={`B${b.id}`} fontSize={9} fill="#64748b" fontFamily="JetBrains Mono" fontStyle="bold" />
                    </React.Fragment>
                  );
                })}

                {/* Direct Transmission Beam Cone */}
                {currentTick && environment?.base_station && (
                  <Shape
                    sceneFunc={(ctx, shape) => {
                      const bx = scaleX(environment.base_station.x);
                      const by = scaleY(environment.base_station.y);
                      const dirRad = (currentTick.optimal_direction * Math.PI) / 180;
                      const widthRad = (currentTick.optimal_width * Math.PI) / 180;
                      const beamLen = CANVAS_W * 0.95;

                      ctx.beginPath();
                      ctx.moveTo(bx, by);
                      ctx.arc(bx, by, beamLen, dirRad - widthRad / 2, dirRad + widthRad / 2, false);
                      ctx.closePath();
                      ctx.fillStrokeShape(shape);
                    }}
                    fill={currentTick.use_reflection ? "rgba(234, 179, 8, 0.08)" : "rgba(56, 189, 248, 0.12)"}
                    stroke={currentTick.use_reflection ? "rgba(234, 179, 8, 0.35)" : "rgba(56, 189, 248, 0.4)"}
                    strokeWidth={1}
                  />
                )}

                {/* Reflection Hop Visualization */}
                {currentTick?.use_reflection &&
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
                        stroke={C.yellow} strokeWidth={2.5} dash={[6, 3]} opacity={0.9}
                      />
                      <Line
                        points={[
                          scaleX(currentTick.reflection_point_x), scaleY(currentTick.reflection_point_y),
                          scaleX(environment.receiver.x), scaleY(environment.receiver.y),
                        ]}
                        stroke={C.yellow} strokeWidth={2.5} dash={[6, 3]} opacity={0.9}
                      />
                      <Circle
                        x={scaleX(currentTick.reflection_point_x)}
                        y={scaleY(currentTick.reflection_point_y)}
                        radius={6} fill={C.yellow} stroke="#fff" strokeWidth={2}
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
                    stroke={C.red} strokeWidth={1} dash={[4, 4]} opacity={0.3}
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
                          ctx.arc(cx, cy, 35, ang - spread / 2, ang + spread / 2, false);
                          ctx.closePath();
                          ctx.fillStrokeShape(shape);
                        }}
                        fill="rgba(250, 204, 21, 0.08)"
                        stroke="rgba(250, 204, 21, 0.25)"
                        strokeWidth={1}
                      />
                      <Circle x={cx} y={cy} radius={3.5} fill="#374151" stroke="#6b7280" strokeWidth={1} />
                    </React.Fragment>
                  );
                })}

                {/* Base Station Node */}
                {environment?.base_station && (() => {
                  const bx = scaleX(environment.base_station.x);
                  const by = scaleY(environment.base_station.y);
                  return (
                    <>
                      <Circle x={bx} y={by} radius={26} fill="transparent" stroke={C.cyan} strokeWidth={1} opacity={0.3} />
                      <Circle x={bx} y={by} radius={14} fill={C.cyan + "33"} stroke={C.cyan} strokeWidth={2} />
                      <Rect x={bx - 36} y={by - 24} width={72} height={14} fill="#0b0f14dd" cornerRadius={6} stroke={C.cyan + "66"} strokeWidth={1} />
                      <Text x={bx - 30} y={by - 21} text="Base Station" fontSize={8} fontStyle="bold" fill={C.cyan} fontFamily="JetBrains Mono" />
                    </>
                  );
                })()}

                {/* Receiver Node */}
                {environment?.receiver && (() => {
                  const rx = scaleX(environment.receiver.x);
                  const ry = scaleY(environment.receiver.y);
                  return (
                    <>
                      <Circle x={rx} y={ry} radius={26} fill="transparent" stroke={C.cyan} strokeWidth={1} opacity={0.3} />
                      <Circle x={rx} y={ry} radius={8} fill={C.green + "44"} stroke={C.green} strokeWidth={2} />
                      <Rect x={rx - 25} y={ry - 24} width={50} height={14} fill="#0b0f14dd" cornerRadius={6} stroke={C.green + "66"} strokeWidth={1} />
                      <Text x={rx - 20} y={ry - 21} text="Receiver" fontSize={8} fontStyle="bold" fill={C.green} fontFamily="JetBrains Mono" />
                    </>
                  );
                })()}

                {/* Warden Trail */}
                {trail.map((pt, i) => (
                  <Circle key={`t-${i}`} x={pt.x} y={pt.y} radius={2} fill={C.red} opacity={(i + 1) / trail.length * 0.45} />
                ))}

                {/* Kalman Filtered Estimate */}
                {currentTick && (
                  <Circle x={scaleX(currentTick.filtered_x)} y={scaleY(currentTick.filtered_y)} radius={4} fill={C.purple} opacity={0.8} />
                )}

                {/* True Warden Threat Marker */}
                {(() => {
                  const wx = scaleX(currentTick ? currentTick.true_x : environment?.warden.x ?? 200);
                  const wy = scaleY(currentTick ? currentTick.true_y : environment?.warden.y ?? 100);
                  return (
                    <>
                      <Circle x={wx} y={wy} radius={15} fill="transparent" stroke={C.red} strokeWidth={1} opacity={0.4} />
                      <Circle x={wx} y={wy} radius={8} fill={C.red} stroke="#000" strokeWidth={2} />
                      <Rect x={wx + 10} y={wy - 8} width={46} height={14} fill="#0b0f14ee" cornerRadius={6} stroke={C.red + "66"} strokeWidth={1} />
                      <Text x={wx + 13} y={wy - 5} text="WARDEN" fontSize={7} fontStyle="bold" fill={C.red} fontFamily="JetBrains Mono" />
                    </>
                  );
                })()}

                {/* Scale & Coordinate Corner tags */}
                <Text x={8} y={CANVAS_H - 16} text="[0, 1000m GRID] • CLICK ANYWHERE TO MOVE WARDEN" fontSize={9} fill={C.textMuted} fontFamily="JetBrains Mono" />
              </Layer>
            </Stage>
          </div>
        </div>

        {/* ── Right: Streamlined Metrics Sidebar ──────────────── */}
        <div data-sidebar="true" style={{
          flex: 1, minWidth: "300px",
          backgroundColor: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: "8px",
          padding: "16px",
          overflowY: "auto",
          height: `${CANVAS_H}px`,
          maxHeight: `${CANVAS_H}px`,
        }}>
          {/* SECTION A — Tab Buttons */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
            <button
              onClick={() => setActiveView("beam")}
              style={{
                backgroundColor: activeView === "beam" ? C.cyan + "22" : "transparent",
                color: activeView === "beam" ? C.cyan : C.text2,
                border: `1px solid ${activeView === "beam" ? C.cyan : C.border}`,
                fontFamily: F.sans,
                fontSize: "12px",
                fontWeight: 600,
                padding: "6px 16px",
                borderRadius: "6px",
                cursor: "pointer",
                flex: 1,
              }}
            >
              Beam Status
            </button>
            <button
              onClick={() => setActiveView("metrics")}
              style={{
                backgroundColor: activeView === "metrics" ? C.cyan + "22" : "transparent",
                color: activeView === "metrics" ? C.cyan : C.text2,
                border: `1px solid ${activeView === "metrics" ? C.cyan : C.border}`,
                fontFamily: F.sans,
                fontSize: "12px",
                fontWeight: 600,
                padding: "6px 16px",
                borderRadius: "6px",
                cursor: "pointer",
                flex: 1,
              }}
            >
              Metrics
            </button>
          </div>

          {/* SECTION B — Conditional Content */}
          {activeView === "beam" ? (
            <div>
              <div style={{ fontFamily: F.sans, fontSize: "13px", fontWeight: 700, color: C.text1, marginBottom: "12px" }}>
                Beam Status
              </div>

              {metricRow("Direction", currentTick ? `${currentTick.optimal_direction.toFixed(1)}°` : "—", C.cyan)}
              {metricRow("Width", currentTick ? `${currentTick.optimal_width.toFixed(0)}°` : "—", C.cyan)}
              {metricRow("Mode", currentTick ? (currentTick.use_reflection ? "REFLECTION" : "DIRECT") : "—", currentTick?.use_reflection ? C.yellow : C.cyan)}
              {metricRow("Secrecy Cs", currentTick ? `${currentTick.secrecy_capacity.toFixed(2)} bps/Hz` : "—", C.purple)}
              {metricRow("Status", currentTick ? (currentTick.is_secure ? "SECURE" : "COMPROMISED") : "—", currentTick?.is_secure ? C.green : C.red)}

              {/* Visual Beam Arc SVG Visualization */}
              <div style={{ marginTop: "16px", textAlign: "center" }}>
                <div style={{ fontFamily: F.sans, fontSize: "10px", color: C.textMuted, marginBottom: "8px" }}>
                  BEAM WIDTH INDICATOR
                </div>
                {(() => {
                  const width = currentTick?.optimal_width ?? 60;
                  const startAngle = 270 - width / 2;
                  const endAngle = 270 + width / 2;
                  const radStart = (startAngle * Math.PI) / 180;
                  const radEnd = (endAngle * Math.PI) / 180;
                  const x1 = 100 + 70 * Math.cos(radStart);
                  const y1 = 100 + 70 * Math.sin(radStart);
                  const x2 = 100 + 70 * Math.cos(radEnd);
                  const y2 = 100 + 70 * Math.sin(radEnd);
                  const largeArc = width > 180 ? 1 : 0;
                  const beamPath = `M ${x1.toFixed(1)} ${y1.toFixed(1)} A 70 70 0 ${largeArc} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
                  const strokeColor = currentTick?.use_reflection ? C.yellow : C.cyan;

                  return (
                    <svg width="200" height="110" style={{ display: "block", margin: "0 auto" }}>
                      {/* Background semicircle arc */}
                      <path d="M 30 100 A 70 70 0 0 1 170 100" stroke="#243242" strokeWidth="10" fill="none" />
                      {/* Colored Beam arc */}
                      <path d={beamPath} stroke={strokeColor} strokeWidth="10" fill="none" strokeLinecap="round" />
                      {/* Center boresight line */}
                      <line x1="100" y1="100" x2="100" y2="30" stroke="white" strokeOpacity="0.3" strokeWidth="1.5" />
                      {/* Text below arc */}
                      <text x="100" y="108" textAnchor="middle" fontSize="11" fill={C.text2} fontFamily={F.mono}>
                        {currentTick ? `${currentTick.optimal_width.toFixed(0)}° beam` : "—"}
                      </text>
                    </svg>
                  );
                })()}
              </div>

              {/* Direct / Reflected Secrecy Stat Boxes */}
              <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
                <div style={{
                  backgroundColor: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: "6px",
                  padding: "10px",
                  flex: 1,
                  textAlign: "center",
                }}>
                  <div style={{ fontFamily: F.sans, fontSize: "9px", color: C.textMuted, marginBottom: "2px" }}>DIRECT</div>
                  <div style={{ fontFamily: F.mono, fontSize: "16px", fontWeight: 700, color: C.purple }}>
                    {currentTick?.direct_secrecy_capacity != null ? currentTick.direct_secrecy_capacity.toFixed(2) : "—"}
                  </div>
                </div>

                <div style={{
                  backgroundColor: C.card,
                  border: `1px solid ${(currentTick?.reflected_secrecy_capacity ?? 0) > 0 ? C.yellow + "44" : C.border}`,
                  borderRadius: "6px",
                  padding: "10px",
                  flex: 1,
                  textAlign: "center",
                }}>
                  <div style={{ fontFamily: F.sans, fontSize: "9px", color: C.textMuted, marginBottom: "2px" }}>REFLECTED</div>
                  <div style={{ fontFamily: F.mono, fontSize: "16px", fontWeight: 700, color: C.yellow }}>
                    {currentTick?.reflected_secrecy_capacity != null ? currentTick.reflected_secrecy_capacity.toFixed(2) : "—"}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div>
              {/* 1. CYBERSECURITY METRICS */}
              {sectionCard("🔒", "Security Intelligence", currentTick?.use_reflection ? "NLOS MODE" : "DIRECT MODE", currentTick?.use_reflection ? C.yellow : C.cyan, <>
                <div style={{
                  backgroundColor: C.bg, borderRadius: "6px", padding: "10px",
                  marginBottom: "8px", textAlign: "center", border: `1px solid ${C.border}`,
                }}>
                  <div style={{ fontFamily: F.sans, fontSize: "9px", color: C.textMuted, letterSpacing: "1px" }}>SECRECY CAPACITY (Cs)</div>
                  <div style={{ fontFamily: F.mono, fontSize: "26px", fontWeight: 800, color: C.purple, margin: "2px 0" }}>
                    {currentTick ? currentTick.secrecy_capacity.toFixed(2) : "0.00"}
                    <span style={{ fontSize: "11px", color: C.textMuted, marginLeft: "4px" }}>bps/Hz</span>
                  </div>
                </div>

                {metricRow("DIRECT SECRECY", currentTick?.direct_secrecy_capacity != null ? `${currentTick.direct_secrecy_capacity.toFixed(2)} bps/Hz` : "—", C.purple)}
                {metricRow("REFLECTED SECRECY", currentTick?.reflected_secrecy_capacity != null ? `${currentTick.reflected_secrecy_capacity.toFixed(2)} bps/Hz` : "—", C.yellow)}
                {metricRow("SNR ADVANTAGE (Δ)", `${snrDeltaNum > 0 ? "+" : ""}${snrDelta} dB`, snrDeltaNum > 0 ? C.green : C.red, "Rx vs Warden")}
              </>)}

              {/* 2. RF BEAM FORMATION */}
              {sectionCard("📶", "Beam Steering & RF Power", `${currentTick?.optimal_width.toFixed(0) ?? "60"}° BEAM`, C.cyan, <>
                {metricRow("OPTIMAL BEAM DIR", currentTick ? `${currentTick.optimal_direction.toFixed(1)}°` : "—", C.cyan)}
                {metricRow("BEAMWIDTH (3dB)", currentTick ? `${currentTick.optimal_width.toFixed(1)}°` : "—", C.cyan)}
                {metricRow("RECEIVER SNR", currentTick ? `${currentTick.rx_snr_db.toFixed(1)} dB` : "—", C.green)}
                {metricRow("WARDEN SNR", currentTick ? `${currentTick.warden_snr_db.toFixed(1)} dB` : "—", C.red)}
              </>)}

              {/* 3. TARGET POSITION & TRACKING */}
              {sectionCard("📍", "Threat Tracking", currentTick?.bs_to_warden_los ? "DIRECT LOS" : "OCCLUDED", currentTick?.bs_to_warden_los ? C.red : C.green, <>
                {metricRow("TRUE WARDEN POS", currentTick ? `(${currentTick.true_x.toFixed(0)}, ${currentTick.true_y.toFixed(0)})` : "—", C.red)}
                {metricRow("KALMAN ESTIMATE", currentTick ? `(${currentTick.filtered_x.toFixed(0)}, ${currentTick.filtered_y.toFixed(0)})` : "—", C.purple)}
                {metricRow("WARDEN OCCLUDED", currentTick ? (currentTick.warden_blocked ? "YES (WALL BLOCKED)" : "NO (IN OPEN)") : "—", currentTick?.warden_blocked ? C.green : C.red)}
              </>)}
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
};

export default App;
