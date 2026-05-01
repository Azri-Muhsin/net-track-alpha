import Layout from "../components/Layout";
import MapBoxCoverageMap from "../components/MapBoxCoverageMap";

<<<<<<< HEAD
export default function HomePage(props: any) {
  const {
    districtGeo,
    districtStats,
    runs,
    selectedRunId,
    setSelectedRunId,
    selectedDistrict,
    setSelectedDistrict,
    selectedOperator,
    setSelectedOperator,
    threshold,
    setThreshold,
    worstDistricts,
    avgRsrp,
    weakCoverage,
    criticalDistricts,
    goodDistricts,
    deltas,
    deltaBadge,
    provinceSummary,
    loading,
    fetchDashboardData,
    dateRange,
    setDateRange,
    apiError,
    geoError,
    getDistrictName,
  } = props;

  return (
    <Layout
      title="Network Drive Testing Dashboard"
      topbarRight={
        <>
          <select
=======
const API_BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL || "http://localhost:8000";

const GEOJSON_PATH = "/sri_lanka_districts.geojson";

type Page = "dashboard" | "route-analysis" | "rig-health";

interface RouteAnalysisProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}


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

export default function RouteAnalysis({ currentPage, onNavigate }: RouteAnalysisProps) {
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
    <Layout title="Route Analysis" currentPage={currentPage} onNavigate={onNavigate}>
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
                    className={`mno ${op.toLowerCase()} ${selectedOperators.includes(op) ? "active" : ""
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
>>>>>>> 25b3bbc71a4bd345976c1c4338237647f945ca5a
            className="nt-pill"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
          >
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="all">All Time</option>
          </select>

          <button className="nt-iconbtn" type="button" onClick={fetchDashboardData}>
            {loading ? "…" : "⟳"}
          </button>
        </>
      }
    >
      <section className="nt-filters">
        <div className="nt-filter">
          <label>DISTRICT</label>
          <select
            className="nt-pill"
            value={selectedDistrict}
            onChange={(e) => setSelectedDistrict(e.target.value)}
            disabled={!districtGeo}
          >
            <option value="all">All Districts</option>
            {(districtGeo?.features ?? [])
              .map((f: any) => getDistrictName(f))
              .sort((a: string, b: string) => a.localeCompare(b))
              .map((name: string) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
          </select>
        </div>

        <div className="nt-filter">
          <label>MNO</label>
          <div className="nt-mno">
            {["Dialog", "Mobitel", "Hutch"].map((op) => (
              <button
                key={op}
                className={`mno ${op.toLowerCase()} ${
                  selectedOperator === op ? "active" : ""
                }`}
                onClick={() =>
                  setSelectedOperator(selectedOperator === op ? "all" : op)
                }
                type="button"
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

            <button
              className="nt-pill"
              type="button"
              onClick={() => {
                setSelectedDistrict("all");
                setSelectedOperator("all");
                setThreshold(-110);
                setDateRange("7d");
                setSelectedRunId("");
              }}
            >
              Reset
            </button>
          </div>
        </div>

        <div className="nt-filter">
          <label>RUN</label>
          <select
            className="nt-pill"
            value={selectedRunId}
            onChange={(e) => setSelectedRunId(e.target.value)}
          >
            <option value="">All Runs</option>

            {runs?.length ? (
              runs.map((r: any) => (
                <option key={r.run_id} value={r.run_id}>
                  {r.run_id}
                </option>
              ))
            ) : (
              <option value="" disabled>
                No runs found
              </option>
            )}
          </select>
        </div>
      </section>

      {apiError && <div className="error-card">API Error: {apiError}</div>}
      {geoError && <div className="error-card">Map Error: {geoError}</div>}

      <section className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-head">
            <p>TOTAL DISTRICTS</p>
            <span className="kpi-icon">▦</span>
          </div>
          <h2>{districtGeo?.features?.length ?? 0}</h2>
          <small>Sri Lanka coverage</small>
        </div>

        <div className="kpi-card">
          <div className="kpi-head">
            <p>AVG RSRP</p>
            <span className="kpi-icon">≋</span>
          </div>
          <h2 className="yellow">
            {avgRsrp !== null ? avgRsrp : "N/A"} dBm
          </h2>
          <small>Selected average</small>
          <div className="kpi-foot">
            {deltaBadge(deltas.avgDelta, "dBm")}
            <span className="kpi-foot-label">vs previous period</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-head">
            <p>% WEAK COVERAGE</p>
            <span className="kpi-icon warn">△</span>
          </div>
          <h2 className="orange">{weakCoverage}%</h2>
          <small>&lt;= {threshold} dBm threshold</small>
          <div className="kpi-foot">
            {deltaBadge(deltas.weakDelta, "%")}
            <span className="kpi-foot-label">vs previous period</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-head">
            <p>DISTRICTS BELOW THRESHOLD</p>
            <span className="kpi-icon bad">▮</span>
          </div>
          <h2 className="red">{criticalDistricts}</h2>
          <small>Require intervention</small>
          <div className="kpi-foot">
            {deltaBadge(deltas.criticalDelta, "")}
            <span className="kpi-foot-label">vs previous period</span>
          </div>
        </div>
      </section>

      <section className="map-card">
        <div className="section-title">
          <div>
            <h2>District Coverage Choropleth</h2>
            <p>Aggregated RSRP weakness by district</p>
          </div>

          <div className="legend">
            <span><i className="dot excellent" />Excellent</span>
            <span><i className="dot good" />Good</span>
            <span><i className="dot fair" />Fair</span>
            <span><i className="dot poor" />Poor</span>
          </div>
        </div>

        <div className="map-layout">
          <div className="sl-map-wrapper">
            {districtGeo ? (
              <MapBoxCoverageMap
                geoJson={districtGeo}
                districtStats={districtStats}
                points={[]}
                selectedDistrict={selectedDistrict}
                onSelectDistrict={setSelectedDistrict}
                showRoute={false}
                autoFitToPoints={false}
              />
            ) : (
              <p>Loading map...</p>
            )}
          </div>

          <aside className="map-side">
            <h3>WEAK % SCALE</h3>
            <p><i className="dot excellent" /> &lt; 10%</p>
            <p><i className="dot good" /> 10–25%</p>
            <p><i className="dot fair" /> 25–45%</p>
            <p><i className="dot poor" /> &gt; 45%</p>

            <h3>QUICK JUMP</h3>
            {worstDistricts.slice(0, 5).map((d: any) => (
              <div className="quick-row" key={d.districtName}>
                <span>{d.districtName}</span>
                <strong>{d.weakPercent}%</strong>
              </div>
            ))}
          </aside>
        </div>
      </section>

      <section className="ranking-card">
        <div className="section-title">
          <h2>Worst Districts Ranking</h2>
          <p>By % weak RSRP</p>
        </div>

<<<<<<< HEAD
        <div className="rank-header">
          <span>#</span>
          <span>District</span>
          <span>% Weak</span>
          <span>Median RSRP</span>
          <span />
        </div>

        {worstDistricts.map((d: any, index: number) => (
          <div className="rank-row" key={d.districtName}>
            <span>{index + 1}</span>

            <strong>
              <i className="dot poor" />
              {d.districtName}
              <small>{d.province}</small>
            </strong>

            <div className="rank-weak">
              <em>{d.weakPercent}%</em>
              <div className="rank-bar">
                <div
                  className="rank-bar-fill"
                  style={{ width: `${Math.min(100, d.weakPercent)}%` }}
=======
            <div style={{ height: 620 }}>
              {districtGeo ? (
                <MapBoxCoverageMap
                  geoJson={districtGeo}
                  districtStats={[]}
                  points={filteredPoints}
                  selectedDistrict="All Districts"
                  onSelectDistrict={() => { }}
                  showRoute={true}
                  autoFitToPoints={true}
>>>>>>> 25b3bbc71a4bd345976c1c4338237647f945ca5a
                />
              </div>
            </div>

            <span className="rank-median">
              {d.medianRsrp !== null ? d.medianRsrp : "N/A"} dBm
            </span>

            <button
              className="rank-view"
              type="button"
              onClick={() => setSelectedDistrict(d.districtName)}
            >
              View
            </button>
          </div>
        ))}

        <div className="summary-strip">
          <div>
            <strong className="green">{goodDistricts}</strong>
            <span>Good Coverage</span>
          </div>

          <div>
            <strong className="red-text">{criticalDistricts}</strong>
            <span>Critical Districts</span>
          </div>
        </div>
      </section>

      <section className="province-card">
        <h2>Province-Level Summary</h2>

        <div className="province-grid">
          {provinceSummary.map((p: any) => (
            <div className="province-box" key={p.province}>
              <span>{p.province}</span>
              <strong>{p.weakPercent}%</strong>
              <small>weak</small>
              <small>{p.districts} dist.</small>
            </div>
          ))}
        </div>
      </section>
    </Layout>
  );
}