import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import MapBoxCoverageMap from "../components/MapBoxCoverageMap";

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

export default function RouteAnalysis() {
  const [districtGeo, setDistrictGeo] = useState<any>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [selectedOperators, setSelectedOperators] = useState<string[]>([]);
  const [threshold, setThreshold] = useState(-110);
  const [cellSearch, setCellSearch] = useState("");
  const [points, setPoints] = useState<DashboardPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchRuns = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/runs`);
      if (!res.ok) throw new Error(`Runs API error ${res.status}`);

      const data = (await res.json()) as RunSummary[];
      setRuns(data);

      if (data.length > 0) {
        setSelectedRunId(data[0].run_id);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load runs");
    }
  };

  const loadGeoJson = async () => {
    try {
      const res = await fetch(GEOJSON_PATH);
      if (!res.ok) {
        throw new Error("sri_lanka_districts.geojson not found in public/");
      }

      const data = await res.json();
      setDistrictGeo(data);
    } catch (err: any) {
      setError(err.message || "Failed to load map");
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

      const data = (await res.json()) as DashboardPoint[];
      setPoints(data);

      const ops = Array.from(new Set(data.map((p) => p.operator).filter(Boolean)));
      setSelectedOperators(ops);
    } catch (err: any) {
      setError(err.message || "Failed to load route data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
    loadGeoJson();
  }, []);

  useEffect(() => {
    fetchRoutePoints();
  }, [selectedRunId]);

  const availableOperators = useMemo(() => {
    return Array.from(new Set(points.map((p) => p.operator).filter(Boolean)));
  }, [points]);

  const filteredPoints = useMemo(() => {
    return points
      .filter((p) =>
        selectedOperators.length
          ? selectedOperators.some(
              (op) => op.toLowerCase() === (p.operator ?? "").toLowerCase()
            )
          : true
      )
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
      weakPercent: values.length
        ? Math.round((weak.length / values.length) * 100)
        : 0,
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

        const minRsrp = Math.min(...values);

        return {
          start: new Date(segment[0].ts_utc).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          end: new Date(segment[segment.length - 1].ts_utc).toLocaleTimeString(
            [],
            { hour: "2-digit", minute: "2-digit" }
          ),
          avgRsrp: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
          minRsrp,
          cells: Array.from(
            new Set(segment.map((p) => p.cell_id).filter(Boolean))
          ).join(", "),
          severity: minRsrp <= -120 ? "POOR" : minRsrp <= -110 ? "FAIR" : "GOOD",
        };
      });
  }, [filteredPoints, threshold]);

  const toggleOperator = (op: string) => {
    setSelectedOperators((prev) =>
      prev.includes(op) ? prev.filter((x) => x !== op) : [...prev, op]
    );
  };

  const selectedRun = runs.find((r) => r.run_id === selectedRunId);

  return (
    <Layout title="Route Analysis">
      <div className="route-page">
        <div className="nt-filters">
          <div className="nt-filter">
            <label>RUN</label>
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
                <option value="">No runs found</option>
              )}
            </select>
          </div>

          <div className="nt-filter">
            <label>MNO</label>
            <div className="nt-mno">
              {availableOperators.length ? (
                availableOperators.map((op) => (
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
                ))
              ) : (
                <span style={{ opacity: 0.7 }}>No operators</span>
              )}
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
              setSelectedOperators(availableOperators);
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

            <div style={{ height: 620 }}>
              {districtGeo ? (
                <MapBoxCoverageMap
                  geoJson={districtGeo}
                  districtStats={[]}
                  points={filteredPoints}
                  selectedDistrict="All Districts"
                  onSelectDistrict={() => {}}
                  showRoute={true}
                  autoFitToPoints={true}
                />
              ) : (
                <p>Loading map...</p>
              )}
            </div>
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
    </Layout>
  );
}