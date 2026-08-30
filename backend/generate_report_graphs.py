"""
generate_report_graphs.py
Reads simulation_log.db and generates 4 graphs for the internship report.
Run: python generate_report_graphs.py
Output: report_graphs/ folder with PNG files.
"""

import sqlite3
import os
import sys

try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.patches as mpatches
    import numpy as np
except ImportError:
    print("Install matplotlib first:  pip install matplotlib")
    sys.exit(1)

DB_PATH = "simulation_log.db"
OUT_DIR = "report_graphs"
os.makedirs(OUT_DIR, exist_ok=True)

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

# ── Pick the longest session for meaningful graphs ────────────────────────
cur.execute("""
    SELECT session_id, COUNT(*) as cnt
    FROM simulation_ticks
    GROUP BY session_id
    ORDER BY cnt DESC
    LIMIT 1
""")
row = cur.fetchone()
if row is None:
    print("No data found in simulation_log.db. Run the simulator first.")
    sys.exit(0)

session_id = row[0]
print(f"Using session: {session_id}  ({row[1]} ticks)")

cur.execute("""
    SELECT tick, secrecy_capacity, direct_secrecy_capacity,
           reflected_secrecy_capacity, rx_snr_db, warden_snr_db,
           is_secure, use_reflection, true_x, true_y,
           filtered_x, filtered_y
    FROM simulation_ticks
    WHERE session_id = ?
    ORDER BY tick ASC
""", (session_id,))
rows = cur.fetchall()
conn.close()

ticks  = [r[0]  for r in rows]
cs     = [r[1]  for r in rows]
cs_dir = [r[2]  for r in rows]
cs_ref = [r[3]  for r in rows]
snr_rx = [r[4]  for r in rows]
snr_w  = [r[5]  for r in rows]
secure = [bool(r[6]) for r in rows]
refl   = [bool(r[7]) for r in rows]
true_x = [r[8]  for r in rows]
true_y = [r[9]  for r in rows]
filt_x = [r[10] for r in rows]
filt_y = [r[11] for r in rows]

STYLE = {
    "figure.facecolor": "#0b0f14",
    "axes.facecolor":   "#111820",
    "axes.edgecolor":   "#243242",
    "axes.labelcolor":  "#cbd5e1",
    "xtick.color":      "#64748b",
    "ytick.color":      "#64748b",
    "grid.color":       "#1e2d3d",
    "text.color":       "#e2e8f0",
    "font.family":      "monospace",
}

# ── Graph 1: Secrecy Capacity over Time ──────────────────────────────────
with plt.rc_context(STYLE):
    fig, ax = plt.subplots(figsize=(12, 4))
    ax.fill_between(ticks, cs, alpha=0.15, color="#a855f7")
    ax.plot(ticks, cs,     color="#a855f7", linewidth=1.5, label="Best Cs")
    ax.plot(ticks, cs_dir, color="#22d3ee", linewidth=0.8, linestyle="--", alpha=0.7, label="Direct Cs")
    ax.plot(ticks, cs_ref, color="#f59e0b", linewidth=0.8, linestyle="--", alpha=0.7, label="Reflected Cs")
    ax.axhline(0, color="#ef4444", linewidth=0.8, linestyle=":")
    ax.set_xlabel("Simulation Tick")
    ax.set_ylabel("Secrecy Capacity (bps/Hz)")
    ax.set_title("Secrecy Capacity over Time — Wyner Wiretap Model", fontsize=12)
    ax.legend(framealpha=0.2, labelcolor="#cbd5e1")
    ax.grid(True, linewidth=0.4)
    plt.tight_layout()
    plt.savefig(os.path.join(OUT_DIR, "1_secrecy_capacity.png"), dpi=150)
    plt.close()
    print("Saved: 1_secrecy_capacity.png")

# ── Graph 2: SNR Comparison (Receiver vs Warden) ─────────────────────────
with plt.rc_context(STYLE):
    fig, ax = plt.subplots(figsize=(12, 4))
    ax.plot(ticks, snr_rx, color="#22c55e", linewidth=1.2, label="Receiver SNR (dB)")
    ax.plot(ticks, snr_w,  color="#ef4444", linewidth=1.2, label="Warden SNR (dB)")
    ax.fill_between(ticks, snr_rx, snr_w,
                    where=[r >= w for r, w in zip(snr_rx, snr_w)],
                    alpha=0.1, color="#22c55e", label="SNR Advantage region")
    ax.set_xlabel("Simulation Tick")
    ax.set_ylabel("SNR (dB)")
    ax.set_title("Receiver vs Warden SNR — Beam Steering Effectiveness", fontsize=12)
    ax.legend(framealpha=0.2, labelcolor="#cbd5e1")
    ax.grid(True, linewidth=0.4)
    plt.tight_layout()
    plt.savefig(os.path.join(OUT_DIR, "2_snr_comparison.png"), dpi=150)
    plt.close()
    print("Saved: 2_snr_comparison.png")

# ── Graph 3: Secure vs Compromised + Reflection Usage ────────────────────
with plt.rc_context(STYLE):
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 5), sharex=True)

    ax1.fill_between(ticks, [1 if s else 0 for s in secure],
                     alpha=0.6, step="mid",
                     color=[("#22c55e" if s else "#ef4444") for s in secure])
    ax1.set_ylabel("Link Status")
    ax1.set_yticks([0, 1])
    ax1.set_yticklabels(["COMPROMISED", "SECURE"])
    ax1.set_title("Link Security Status and Beam Mode over Time", fontsize=12)
    ax1.grid(True, linewidth=0.4)

    ax2.fill_between(ticks, [1 if r else 0 for r in refl],
                     alpha=0.6, step="mid",
                     color=[("#f59e0b" if r else "#22d3ee") for r in refl])
    ax2.set_ylabel("Beam Mode")
    ax2.set_yticks([0, 1])
    ax2.set_yticklabels(["DIRECT", "REFLECTION"])
    ax2.set_xlabel("Simulation Tick")
    ax2.grid(True, linewidth=0.4)

    plt.tight_layout()
    plt.savefig(os.path.join(OUT_DIR, "3_security_status.png"), dpi=150)
    plt.close()
    print("Saved: 3_security_status.png")

# ── Graph 4: Kalman Filter Tracking Accuracy ─────────────────────────────
error = [((tx - fx)**2 + (ty - fy)**2)**0.5
         for tx, ty, fx, fy in zip(true_x, true_y, filt_x, filt_y)]

with plt.rc_context(STYLE):
    fig, ax = plt.subplots(figsize=(12, 4))
    ax.plot(ticks, error, color="#818cf8", linewidth=1.0, alpha=0.8)
    ax.fill_between(ticks, error, alpha=0.1, color="#818cf8")
    ax.set_xlabel("Simulation Tick")
    ax.set_ylabel("Tracking Error (m)")
    ax.set_title("Kalman Filter Tracking Error — True vs Estimated Warden Position", fontsize=12)
    ax.grid(True, linewidth=0.4)
    plt.tight_layout()
    plt.savefig(os.path.join(OUT_DIR, "4_kalman_tracking_error.png"), dpi=150)
    plt.close()
    print("Saved: 4_kalman_tracking_error.png")

print(f"\nAll graphs saved to: {os.path.abspath(OUT_DIR)}/")
