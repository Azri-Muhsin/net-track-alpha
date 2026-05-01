import { useEffect, useState, useRef, useCallback } from "react";
import Layout from "../components/Layout";
import TempRsrpBollingerChart, { RigDataPoint } from "../components/TempRsrpBollingerChart";
import VibrationRsrpChart from "../components/VibrationRsrpChart";

const API_BASE_URL =
    (import.meta as any).env?.VITE_API_BASE_URL || "http://localhost:8000";

type Page = "dashboard" | "route-analysis" | "rig-health";

interface RunSummary {
    run_id: string;
    vehicle_id?: string;
    start_time?: string;
    point_count?: number;
}

interface RigHealthProps {
    currentPage: Page;
    onNavigate: (page: Page) => void;
}

const POLL_INTERVAL_MS = 5000;

export default function RigHealth({ currentPage, onNavigate }: RigHealthProps) {
    const [runs, setRuns] = useState<RunSummary[]>([]);
    const [selectedRunId, setSelectedRunId] = useState("");
    const [selectedOperator, setSelectedOperator] = useState("");
    const [data, setData] = useState<RigDataPoint[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [liveMode, setLiveMode] = useState(true);

    const lastTsRef = useRef<string | null>(null);
    const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Fetch runs ──────────────────────────────────────────────────────────────
    useEffect(() => {
        fetch(`${API_BASE_URL}/api/runs`)
            .then((r) => r.json())
            .then((d: RunSummary[]) => {
                setRuns(d);
                if (d.length > 0) setSelectedRunId(d[0].run_id);
            })
            .catch(() => setError("Failed to load runs"));
    }, []);

    // ── Fetch full timeseries ───────────────────────────────────────────────────
    const fetchFull = useCallback(async () => {
        if (!selectedRunId) return;
        setLoading(true);
        setError("");
        try {
            const params = new URLSearchParams({ run_id: selectedRunId, limit: "5000" });
            if (selectedOperator) params.set("operator", selectedOperator);
            const res = await fetch(`${API_BASE_URL}/api/rig-health/timeseries?${params}`);
            if (!res.ok) throw new Error(`API error ${res.status}`);
            const points: RigDataPoint[] = await res.json();
            setData(points);
            if (points.length > 0) {
                lastTsRef.current = points[points.length - 1].ts_utc;
            }
        } catch (e: any) {
            setError(e.message || "Failed to load data");
        } finally {
            setLoading(false);
        }
    }, [selectedRunId, selectedOperator]);

    // ── Fetch incremental (live poll) ───────────────────────────────────────────
    const fetchIncremental = useCallback(async () => {
        if (!selectedRunId || !lastTsRef.current) return;
        try {
            const params = new URLSearchParams({
                run_id: selectedRunId,
                start_after: lastTsRef.current,
                limit: "500",
            });
            if (selectedOperator) params.set("operator", selectedOperator);
            const res = await fetch(`${API_BASE_URL}/api/rig-health/timeseries?${params}`);
            if (!res.ok) return;
            const newPoints: RigDataPoint[] = await res.json();
            if (newPoints.length > 0) {
                lastTsRef.current = newPoints[newPoints.length - 1].ts_utc;
                setData((prev) => [...prev, ...newPoints]);
            }
        } catch {
            // silent on poll errors
        }
    }, [selectedRunId, selectedOperator]);

    // ── (Re)start full fetch when run/operator changes ──────────────────────────
    useEffect(() => {
        lastTsRef.current = null;
        setData([]);
        fetchFull();
    }, [fetchFull]);

    // ── Manage polling timer ────────────────────────────────────────────────────
    useEffect(() => {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        if (liveMode && selectedRunId) {
            pollTimerRef.current = setInterval(fetchIncremental, POLL_INTERVAL_MS);
        }
        return () => {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        };
    }, [liveMode, selectedRunId, fetchIncremental]);

    // ── Derived stats ───────────────────────────────────────────────────────────
    const latestTemp = data.length
        ? data[data.length - 1].temp_c?.toFixed(1) ?? "—"
        : "—";
    const latestRsrp = data.length
        ? data[data.length - 1].rsrp_dbm?.toFixed(1) ?? "—"
        : "—";
    const tempPoints = data.filter((d) => d.temp_c != null);
    const avgTemp = tempPoints.length > 0
        ? (
            tempPoints.reduce((s, d) => s + (d.temp_c ?? 0), 0) /
            tempPoints.length
        ).toFixed(1)
        : "—";

    // Fallback denominator to 1 if no points exist to avoid NaN
    const vibPoints = data.filter((d) => d.vibration_m_s2 != null);
    const avgVib = vibPoints.length > 0
        ? (
            vibPoints.reduce((s, d) => s + (d.vibration_m_s2 ?? 0), 0) /
            vibPoints.length
        ).toFixed(2)
        : "—";

    const cardStyle: React.CSSProperties = {
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
        padding: "20px 24px",
    };

    return (
        <Layout
            title="Rig Health"
            currentPage={currentPage}
            onNavigate={onNavigate}
        >
            {/* ── Controls ── */}
            <div
                style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 12,
                    alignItems: "center",
                    marginBottom: 24,
                }}
            >
                {/* Run selector */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, opacity: 0.5, letterSpacing: 1 }}>
                        RUN
                    </label>
                    <select
                        className="nt-pill"
                        value={selectedRunId}
                        onChange={(e) => setSelectedRunId(e.target.value)}
                    >
                        {runs.length ? (
                            runs.map((r) => (
                                <option key={r.run_id} value={r.run_id}>
                                    {r.run_id}
                                </option>
                            ))
                        ) : (
                            <option value="">No runs</option>
                        )}
                    </select>
                </div>

                {/* Operator selector */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, opacity: 0.5, letterSpacing: 1 }}>
                        OPERATOR
                    </label>
                    <select
                        className="nt-pill"
                        value={selectedOperator}
                        onChange={(e) => setSelectedOperator(e.target.value)}
                    >
                        <option value="">All (avg)</option>
                        {["Dialog", "Mobitel", "Hutch", "Airtel"].map((op) => (
                            <option key={op} value={op}>
                                {op}
                            </option>
                        ))}
                    </select>
                </div>



                {/* Refresh button */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, opacity: 0.5, letterSpacing: 1 }}>
                        &nbsp;
                    </label>
                    <button className="nt-iconbtn" type="button" onClick={fetchFull}>
                        {loading ? "…" : "⟳"}
                    </button>
                </div>

                {/* Live toggle */}
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                        type="button"
                        onClick={() => setLiveMode((p) => !p)}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 7,
                            padding: "8px 16px",
                            borderRadius: 20,
                            border: `1px solid ${liveMode ? "#ef4444" : "rgba(255,255,255,0.15)"}`,
                            background: liveMode ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.04)",
                            color: liveMode ? "#ef4444" : "rgba(255,255,255,0.5)",
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: "pointer",
                            transition: "all 0.2s",
                        }}
                    >
                        <span
                            style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: liveMode ? "#ef4444" : "rgba(255,255,255,0.3)",
                                display: "inline-block",
                                boxShadow: liveMode ? "0 0 8px #ef4444" : "none",
                                animation: liveMode ? "pulse-red 1.5s infinite" : "none",
                            }}
                        />
                        {liveMode ? "LIVE" : "PAUSED"}
                    </button>
                </div>
            </div>

            {error && <div className="error-card">Error: {error}</div>}

            {/* ── KPI row ── */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                    gap: 16,
                    marginBottom: 24,
                }}
            >
                <div style={cardStyle}>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 700, opacity: 0.5 }}>LATEST TEMP</p>
                    <h2 style={{ margin: "6px 0 0", fontSize: 28, color: "#f97316" }}>{latestTemp} °C</h2>
                    <small style={{ opacity: 0.5 }}>Device temperature</small>
                </div>
                <div style={cardStyle}>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 700, opacity: 0.5 }}>LATEST RSRP</p>
                    <h2 style={{ margin: "6px 0 0", fontSize: 28, color: "#22d3ee" }}>{latestRsrp} dBm</h2>
                    <small style={{ opacity: 0.5 }}>Signal strength</small>
                </div>
                <div style={cardStyle}>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 700, opacity: 0.5 }}>AVG TEMP</p>
                    <h2 style={{ margin: "6px 0 0", fontSize: 28 }}>{avgTemp} °C</h2>
                    <small style={{ opacity: 0.5 }}>{data.length} samples</small>
                </div>
                <div style={cardStyle}>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 700, opacity: 0.5 }}>AVG VIBRATION</p>
                    <h2 style={{ margin: "6px 0 0", fontSize: 28, color: "#a3e635" }}>{avgVib} m/s²</h2>
                    <small style={{ opacity: 0.5 }}>Intensity</small>
                </div>
            </div>

            {/* ── Chart ── */}
            <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
                {/* Chart header */}
                <div
                    style={{
                        padding: "16px 24px",
                        borderBottom: "1px solid rgba(255,255,255,0.07)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                    }}
                >
                    <div>
                        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
                            Temperature vs Signal Strength
                        </h3>
                        <p style={{ margin: "3px 0 0", fontSize: 12, opacity: 0.5 }}>
                            Real-time correlation of device temperature vs network signal strength
                        </p>
                    </div>
                    <div style={{ display: "flex", gap: 16, fontSize: 12, opacity: 0.6 }}>
                        <span style={{ color: "#f97316" }}>■ Temperature</span>
                        <span style={{ color: "#22d3ee" }}>■ RSRP</span>
                    </div>
                </div>

                {/* Chart body */}
                <div style={{ padding: "16px 16px 0" }}>
                    {data.length === 0 ? (
                        <div
                            style={{
                                height: 420,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                opacity: 0.4,
                                flexDirection: "column",
                                gap: 8,
                            }}
                        >
                            <span style={{ fontSize: 40 }}>📡</span>
                            <span>{loading ? "Loading data…" : "No data for selected run"}</span>
                        </div>
                    ) : (
                        <TempRsrpBollingerChart
                            data={data}
                            height={420}
                        />
                    )}
                </div>

                {/* Footer note */}
                {data.length > 0 && (
                    <div
                        style={{
                            padding: "10px 24px 14px",
                            fontSize: 11,
                            opacity: 0.4,
                            borderTop: "1px solid rgba(255,255,255,0.04)",
                            marginTop: 8,
                        }}
                    >
                        Showing {data.length} samples • Last: {data[data.length - 1].ts_utc} •{" "}
                        {liveMode ? `Auto-refreshes every ${POLL_INTERVAL_MS / 1000}s` : "Polling paused"}
                    </div>
                )}
            </div>

            {/* ── Vibration Chart ── */}
            <div style={{ ...cardStyle, padding: 0, overflow: "hidden", marginTop: 24 }}>
                {/* Chart header */}
                <div
                    style={{
                        padding: "16px 24px",
                        borderBottom: "1px solid rgba(255,255,255,0.07)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                    }}
                >
                    <div>
                        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
                            Vibration Intensity vs Signal Strength
                        </h3>
                        <p style={{ margin: "3px 0 0", fontSize: 12, opacity: 0.5 }}>
                            Real-time correlation of physical vibration (magnitude) vs network signal strength
                        </p>
                    </div>
                    <div style={{ display: "flex", gap: 16, fontSize: 12, opacity: 0.6 }}>
                        <span style={{ color: "#a3e635" }}>■ Vibration</span>
                        <span style={{ color: "#22d3ee" }}>■ RSRP</span>
                    </div>
                </div>

                {/* Chart body */}
                <div style={{ padding: "16px 16px 0" }}>
                    {data.length === 0 ? (
                        <div
                            style={{
                                height: 300,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                opacity: 0.4,
                                flexDirection: "column",
                                gap: 8,
                            }}
                        >
                            <span style={{ fontSize: 40 }}>📳</span>
                            <span>{loading ? "Loading data…" : "No data for selected run"}</span>
                        </div>
                    ) : (
                        <VibrationRsrpChart
                            data={data as any}
                            height={300}
                        />
                    )}
                </div>

                {/* Footer note */}
                {data.length > 0 && (
                    <div
                        style={{
                            padding: "10px 24px 14px",
                            fontSize: 11,
                            opacity: 0.4,
                            borderTop: "1px solid rgba(255,255,255,0.04)",
                            marginTop: 8,
                        }}
                    >
                        Showing {data.length} samples • Last: {data[data.length - 1].ts_utc} •{" "}
                        {liveMode ? `Auto-refreshes every ${POLL_INTERVAL_MS / 1000}s` : "Polling paused"}
                    </div>
                )}
            </div>

            {/* ── Pulse animation ── */}
            <style>{`
        @keyframes pulse-red {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
        </Layout>
    );
}
