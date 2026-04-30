import { useEffect, useMemo, useState } from "react";
import * as d3 from "d3";

const API_BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL || "http://localhost:8000";

const GEOJSON_PATH = "/sri_lanka_districts.geojson";

interface RunSummary {
  run_id: string;
  vehicle_id?: string;
  point_count?: number;
  district?: string;
  province?: string;
}

interface DashboardPoint {
  id: string;
  ts_utc: string;
  run_id?: string;
  operator: string;
  rsrp_dbm: number | null;
  rsrq_db?: number | null;
  sinr_db: number | null;
  cell_id?: string | null;
  lat: number | null;
  lon: number | null;
  district?: string;
}

type Operator = "Dialog" | "Mobitel" | "Hutch";

function getSeverity(rsrp: number | null) {
  if (rsrp === null) return "unknown";
  if (rsrp <= -110) return "poor";
  if (rsrp <= -100) return "fair";
  if (rsrp <= -90) return "good";
  return "excellent";
}

function severityColor(rsrp: number | null) {
  const severity = getSeverity(rsrp);
  if (severity === "poor") return "#ef4444";
  if (severity === "fair") return "#f97316";
  if (severity === "good") return "#facc15";
  if (severity === "excellent") return "#22c55e";
  return "#64748b";
}

export default function RouteAnalysis() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [selectedOperators, setSelectedOperators] = useState<Operator[]>([
    "Dialog",
    "Mobitel",
    "Hutch",
  ]);
  const [threshold, setThreshold] = useState(-110);
  const [cellSearch, setCellSearch] = useState("");
  const [points, setPoints] = useState<DashboardPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchRuns = async () => {
    const res = await fetch(`${API_BASE_URL}/api/runs`);
    const data = await res.json();
    setRuns(data);

    if (data.length > 0) {
      setSelectedRunId(data[0].run_id);
    }
  };

  const fetchRoutePoints = async () => {
    if (!selectedRunId) return;

    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams();
      params.set("run_id", selectedRunId);
      params.set("limit", "10000");

      const res = await fetch(
        `${API_BASE_URL}/api/dashboard/points?${params.toString()}`
      );

      if (!res.ok) throw new Error(`API error ${res.status}`);

      const data = await res.json();
      setPoints(data);
    } catch (err: any) {
      setError(err.message || "Failed to load route data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  useEffect(() => {
    fetchRoutePoints();
  }, [selectedRunId]);

  const filteredPoints = useMemo(() => {
    return points
      .filter((p) => selectedOperators.includes(p.operator as Operator))
      .filter((p) => {
        if (!cellSearch.trim()) return true;
        return String(p.cell_id ?? "")
          .toLowerCase()
          .includes(cellSearch.toLowerCase());
      })
      .filter(
        (p) =>
          typeof p.lat === "number" &&
          typeof p.lon === "number" &&
          typeof p.rsrp_dbm === "number"
      );
  }, [points, selectedOperators, cellSearch]);

  const routeStats = useMemo(() => {
    const values = filteredPoints
      .map((p) => p.rsrp_dbm)
      .filter((v): v is number => typeof v === "number");

    const weak = values.filter((v) => v <= threshold);

    return {
      totalSamples: values.length,
      avgRsrp: values.length
        ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
        : null,
      weakSamples: weak.length,
      weakPercent: values.length ? Math.round((weak.length / values.length) * 100) : 0,
    };
  }, [filteredPoints, threshold]);

  const degradationSegments = useMemo(() => {
    const sorted = [...filteredPoints].sort(
      (a, b) => new Date(a.ts_utc).getTime() - new Date(b.ts_utc).getTime()
    );

    const segments: DashboardPoint[][] = [];
    let current: DashboardPoint[] = [];

    sorted.forEach((p) => {
      if ((p.rsrp_dbm ?? 0) <= threshold) {
        current.push(p);
      } else if (current.length > 0) {
        segments.push(current);
        current = [];
      }
    });

    if (current.length > 0) segments.push(current);

    return segments
      .filter((s) => s.length >= 2)
      .map((segment) => {
        const values = segment
          .map((p) => p.rsrp_dbm)
          .filter((v): v is number => typeof v === "number");

        return {
          start: new Date(segment[0].ts_utc).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          end: new Date(segment[segment.length - 1].ts_utc).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          avgRsrp: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
          minRsrp: Math.min(...values),
          cells: Array.from(new Set(segment.map((p) => p.cell_id).filter(Boolean))).join(
            ", "
          ),
          severity:
            Math.min(...values) <= -120
              ? "POOR"
              : Math.min(...values) <= -110
                ? "FAIR"
                : "GOOD",
        };
      });
  }, [filteredPoints, threshold]);

  const toggleOperator = (op: Operator) => {
    setSelectedOperators((prev) =>
      prev.includes(op) ? prev.filter((x) => x !== op) : [...prev, op]
    );
  };

  const selectedRun = runs.find((r) => r.run_id === selectedRunId);

  const routeSvg = useMemo(() => {
    const width = 760;
    const height = 430;
    const padding = 45;

    const valid = filteredPoints.filter(
      (p) => typeof p.lon === "number" && typeof p.lat === "number"
    );

    if (!valid.length) {
      return { width, height, elements: null };
    }

    const lonExtent = d3.extent(valid, (p) => p.lon as number) as [number, number];
    const latExtent = d3.extent(valid, (p) => p.lat as number) as [number, number];

    const x = d3.scaleLinear().domain(lonExtent).range([padding, width - padding]);
    const y = d3.scaleLinear().domain(latExtent).range([height - padding, padding]);

    return {
      width,
      height,
      elements: (
        <>
          {d3.range(0, 8).map((i) => (
            <line
              key={`v-${i}`}
              x1={(width / 8) * i}
              x2={(width / 8) * i}
              y1={0}
              y2={height}
              stroke="rgba(255,255,255,0.05)"
            />
          ))}

          {d3.range(0, 7).map((i) => (
            <line
              key={`h-${i}`}
              x1={0}
              x2={width}
              y1={(height / 7) * i}
              y2={(height / 7) * i}
              stroke="rgba(255,255,255,0.05)"
            />
          ))}

          {valid.map((p, i) => (
            <circle
              key={`${p.id}-${i}`}
              cx={x(p.lon as number)}
              cy={y(p.lat as number)}
              r={5}
              fill={severityColor(p.rsrp_dbm)}
              opacity={0.9}
            />
          ))}

          {valid[0] && (
            <text
              x={x(valid[0].lon as number) + 8}
              y={y(valid[0].lat as number)}
              fill="#e5e7eb"
              fontSize={13}
            >
              Start
            </text>
          )}

          {valid[valid.length - 1] && (
            <text
              x={x(valid[valid.length - 1].lon as number) + 8}
              y={y(valid[valid.length - 1].lat as number)}
              fill="#e5e7eb"
              fontSize={13}
            >
              End
            </text>
          )}
        </>
      ),
    };
  }, [filteredPoints]);

  return (
    <div className="route-page">
        <button
        className="nt-pill"
        type="button"
        onClick={() => window.location.reload()}
        style={{ marginBottom: "16px" }}
        >
        Back to Dashboard
        </button>
        
      <div className="nt-filters">
        <div className="nt-filter">
          <label>RUN</label>
          <select
            className="nt-pill"
            value={selectedRunId}
            onChange={(e) => setSelectedRunId(e.target.value)}
          >
            {runs.map((r) => (
              <option key={r.run_id} value={r.run_id}>
                {r.run_id}
              </option>
            ))}
          </select>
        </div>

        <div className="nt-filter">
          <label>MNO</label>
          <div className="nt-mno">
            {(["Dialog", "Mobitel", "Hutch"] as Operator[]).map((op) => (
              <button
                key={op}
                type="button"
                className={`mno ${op.toLowerCase()} ${
                  selectedOperators.includes(op) ? "active" : ""
                }`}
                onClick={() => toggleOperator(op)}
              >
                {op}
              </button>
            ))}
          </div>
        </div>

        <div className="nt-filter grow">
          <label>THRESHOLD</label>
          <div className="nt-threshold">
            <input
              type="range"
              min="-125"
              max="-80"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
            />
            <div className="nt-threshold-val">{threshold} dBm</div>
          </div>
        </div>

        <div className="nt-filter">
          <label>CELL ID</label>
          <input
            className="nt-pill"
            value={cellSearch}
            onChange={(e) => setCellSearch(e.target.value)}
            placeholder="Search..."
          />
        </div>

        <button
          className="nt-pill"
          type="button"
          onClick={() => {
            setSelectedOperators(["Dialog", "Mobitel", "Hutch"]);
            setThreshold(-110);
            setCellSearch("");
          }}
        >
          Reset
        </button>
      </div>

      {error && <div className="error-card">API Error: {error}</div>}

      <section className="map-layout">
        <div className="map-card">
          <div className="section-title">
            <div>
              <h2>Signal Heatmap</h2>
              <p>
                {selectedRun?.district ?? "Selected route"} •{" "}
                {loading ? "Loading..." : `${filteredPoints.length} samples`}
              </p>
            </div>

            <div className="legend">
              <span><i className="dot excellent" />Excellent</span>
              <span><i className="dot good" />Good</span>
              <span><i className="dot fair" />Fair</span>
              <span><i className="dot poor" />Poor</span>
            </div>
          </div>

          <svg
            width="100%"
            viewBox={`0 0 ${routeSvg.width} ${routeSvg.height}`}
            style={{
              background: "#082033",
              borderRadius: 14,
              minHeight: 430,
            }}
          >
            {routeSvg.elements ?? (
              <text x="50%" y="50%" fill="#cbd5e1" textAnchor="middle">
                No route points found for selected filters
              </text>
            )}
          </svg>
        </div>

        <div className="map-card">
          <div className="section-title">
            <div>
              <h2>Signal Summary</h2>
              <p>Route-level KPIs</p>
            </div>
          </div>

          <div className="province-grid">
            <div className="province-box">
              <span>Total Samples</span>
              <strong>{routeStats.totalSamples}</strong>
            </div>

            <div className="province-box">
              <span>Avg RSRP</span>
              <strong>{routeStats.avgRsrp ?? "N/A"} dBm</strong>
            </div>

            <div className="province-box">
              <span>Weak Samples</span>
              <strong>{routeStats.weakSamples}</strong>
            </div>

            <div className="province-box">
              <span>Weak %</span>
              <strong>{routeStats.weakPercent}%</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="ranking-card">
        <div className="section-title">
          <div>
            <h2>Degradation Segments</h2>
            <p>Continuous sections below {threshold} dBm</p>
          </div>
        </div>

        <div className="rank-header">
          <span>Start</span>
          <span>End</span>
          <span>Avg RSRP</span>
          <span>Min RSRP</span>
          <span>Cell IDs</span>
          <span>Severity</span>
        </div>

        {degradationSegments.length ? (
          degradationSegments.map((s, i) => (
            <div className="rank-row" key={i}>
              <span>{s.start}</span>
              <span>{s.end}</span>
              <span className="red-text">{s.avgRsrp} dBm</span>
              <span className="red-text">{s.minRsrp} dBm</span>
              <span>{s.cells || "N/A"}</span>
              <strong className={s.severity === "POOR" ? "red-text" : "orange"}>
                {s.severity}
              </strong>
            </div>
          ))
        ) : (
          <div className="rank-row">
            <span>No degradation segments found</span>
          </div>
        )}
      </section>
    </div>
  );
}