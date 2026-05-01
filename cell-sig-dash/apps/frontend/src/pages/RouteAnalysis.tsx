import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import MapBoxCoverageMap from "../components/MapBoxCoverageMap";
import SignalFluctuationChart from "../components/SignalFluctuationChart";
import { useTheme } from "../lib/ThemeContext";

const API_BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL || "http://localhost:8000";

const GEOJSON_PATH = "/sri_lanka_districts.geojson";

type Page = "dashboard" | "route-analysis" | "data-table" | "rig-health";

interface RouteAnalysisProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

interface RunSummary {
  run_id: string;
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

export default function RouteAnalysis({
  currentPage,
  onNavigate,
}: RouteAnalysisProps) {
  const { colors } = useTheme();

  const [districtGeo, setDistrictGeo] = useState<any>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [selectedOperators, setSelectedOperators] = useState<string[]>([]);
  const [threshold, setThreshold] = useState(-110);
  const [cellSearch, setCellSearch] = useState("");
  const [points, setPoints] = useState<DashboardPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const cardStyle = {
    background: colors.glassBg,
    borderColor: colors.border,
    color: colors.text,
  };

  const inputStyle = {
    background: colors.glassBg,
    borderColor: colors.border,
    color: colors.text,
  };

  const muted = { color: colors.textSecondary };

  const fetchRuns = async () => {
    const res = await fetch(`${API_BASE_URL}/api/runs`);
    const data = await res.json();
    setRuns(data);
    if (data.length) setSelectedRunId(data[0].run_id);
  };

  const loadGeoJson = async () => {
    const res = await fetch(GEOJSON_PATH);
    const data = await res.json();
    setDistrictGeo(data);
  };

  const fetchRoutePoints = async () => {
    if (!selectedRunId) return;

    setLoading(true);

    const params = new URLSearchParams();
    params.set("run_id", selectedRunId);
    params.set("limit", "10000");

    const res = await fetch(
      `${API_BASE_URL}/api/dashboard/points?${params.toString()}`
    );

    const data = (await res.json()) as DashboardPoint[];
    setPoints(data);

    const ops: string[] = Array.from(
      new Set(
        data
          .map((p) => p.operator)
          .filter((op): op is string => Boolean(op))
      )
    );

    setSelectedOperators(ops);
    setLoading(false);
  };

  useEffect(() => {
    fetchRuns();
    loadGeoJson();
  }, []);

  useEffect(() => {
    fetchRoutePoints();
  }, [selectedRunId]);

  const availableOperators = useMemo((): string[] => {
  return Array.from(
    new Set(
      points
        .map((p) => p.operator)
        .filter((op): op is string => Boolean(op))
    )
  );
}, [points]);

  const filteredPoints = useMemo(() => {
    return points.filter(
      (p) =>
        selectedOperators.includes(p.operator) &&
        (!cellSearch ||
          (p.cell_id ?? "")
            .toLowerCase()
            .includes(cellSearch.toLowerCase()))
    );
  }, [points, selectedOperators, cellSearch]);

  const toggleOperator = (op: string) => {
    setSelectedOperators((prev) =>
      prev.length === 1 && prev[0] === op ? availableOperators : [op]
    );
  };

  return (
    <Layout title="Route Analysis" currentPage={currentPage} onNavigate={onNavigate}>
      <div style={{ color: colors.text }}>
        {/* FILTERS */}
        <div className="nt-filters" style={{ borderBottomColor: colors.border }}>
          <div className="nt-filter">
            <label style={muted}>RUN</label>
            <select
              className="nt-pill"
              value={selectedRunId}
              onChange={(e) => setSelectedRunId(e.target.value)}
              style={inputStyle}
            >
              {runs.map((r) => (
                <option key={r.run_id} value={r.run_id}>
                  {r.run_id}
                </option>
              ))}
            </select>
          </div>

          <div className="nt-filter">
            <label style={muted}>MNO</label>
            <div className="nt-mno">
              {availableOperators.map((op) => (
                <button
                  key={op}
                  className={`mno ${op.toLowerCase()}`}
                  onClick={() => toggleOperator(op)}
                  style={inputStyle}
                >
                  {op}
                </button>
              ))}
            </div>
          </div>

          <div className="nt-filter">
            <label style={muted}>THRESHOLD</label>
            <input
              type="range"
              min="-125"
              max="-80"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
            />
            <div style={muted}>{threshold} dBm</div>
          </div>

          <div className="nt-filter">
            <label style={muted}>CELL ID</label>
            <input
              className="nt-pill"
              value={cellSearch}
              onChange={(e) => setCellSearch(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        {/* MAP */}
        <section className="map-card" style={cardStyle}>
          <h2 style={{ color: colors.text }}>Signal Heatmap</h2>

          <div style={{ height: 600 }}>
            {districtGeo && (
              <MapBoxCoverageMap
                geoJson={districtGeo}
                districtStats={[]}
                points={filteredPoints}
                selectedDistrict="All"
                onSelectDistrict={() => {}}
                showRoute
                autoFitToPoints
              />
            )}
          </div>
        </section>

        {/* KPI */}
        <section className="map-card" style={cardStyle}>
          <h2>Signal Summary</h2>

          <div className="province-grid">
            <div className="province-box" style={inputStyle}>
              <span style={muted}>Samples</span>
              <strong>{filteredPoints.length}</strong>
            </div>
          </div>
        </section>

        {/* CHART */}
        <section className="map-card" style={cardStyle}>
          <h2>Signal Fluctuation</h2>
          <SignalFluctuationChart data={filteredPoints} />
        </section>
      </div>
    </Layout>
  );
}