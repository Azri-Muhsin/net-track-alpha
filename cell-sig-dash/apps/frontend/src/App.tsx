import { useEffect, useMemo, useState } from "react";
import "./App.css";
import MapBoxCoverageMap from "./components/MapBoxCoverageMap";
import Layout from "./components/Layout";

interface DashboardPoint {
  id: string;
  ts_utc: string;
  operator: string;
  rsrp_dbm: number | null;
  sinr_db: number | null;
  lat: number | null;
  lon: number | null;
}

interface DistrictStat {
  districtName: string;
  province: string;
  totalSamples: number;
  weakPercent: number;
  avgRsrp: number | null;
  medianRsrp: number | null;
}

interface RunSummary {
  run_id: string;
  vehicle_id?: string;
  operator?: string;
  point_count?: number;
}

interface DashboardSummaryResponse {
  run_id: string | null;
  operator: string | null;
  district: string | null;
  threshold: number;
  total_samples: number;
  avg_rsrp: number | null;
  weak_coverage_percent: number;
  critical_count: number;
  district_stats: DistrictStat[];
}

type DateRangeId = "24h" | "7d" | "30d" | "all";

const GEOJSON_PATH = "/sri_lanka_districts.geojson";

const API_BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL || "http://localhost:8000";

function getDistrictName(feature: any) {
  const raw =
    feature.properties.shapeName ||
    feature.properties.NAME_2 ||
    feature.properties.district ||
    feature.properties.name ||
    "Unknown";

  return raw.replace(" District", "").trim();
}

function dateRangeToStartTs(range: DateRangeId) {
  if (range === "all") return null;

  const now = new Date();

  const ms =
    range === "24h"
      ? 24 * 60 * 60 * 1000
      : range === "7d"
        ? 7 * 24 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000;

  return new Date(now.getTime() - ms).toISOString();
}

export default function App() {
  const [districtGeo, setDistrictGeo] = useState<any>(null);
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [prevSummary, setPrevSummary] =
    useState<DashboardSummaryResponse | null>(null);

  const [points, setPoints] = useState<DashboardPoint[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);

  const [selectedRunId, setSelectedRunId] = useState("");
  const [selectedOperator, setSelectedOperator] = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState("All Districts");
  const [dateRange, setDateRange] = useState<DateRangeId>("7d");
  const [threshold, setThreshold] = useState(-110);

  const [apiError, setApiError] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const rangeMs = useMemo(() => {
    if (dateRange === "all") return null;
    if (dateRange === "24h") return 24 * 60 * 60 * 1000;
    if (dateRange === "7d") return 7 * 24 * 60 * 60 * 1000;
    return 30 * 24 * 60 * 60 * 1000;
  }, [dateRange]);

  const makeParams = (
    start_ts?: string | null,
    end_ts?: string | null,
    includeDistrict = true
  ) => {
    const p = new URLSearchParams();

    if (selectedRunId) p.set("run_id", selectedRunId);
    if (selectedOperator) p.set("operator", selectedOperator);

    if (
      includeDistrict &&
      selectedDistrict &&
      selectedDistrict !== "All Districts"
    ) {
      p.set("district", selectedDistrict);
    }

    p.set("threshold", String(threshold));

    if (start_ts) p.set("start_ts", start_ts);
    if (end_ts) p.set("end_ts", end_ts);

    return p;
  };

  const fetchRuns = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/runs`);

      if (!res.ok) {
        throw new Error(`Runs API error: ${res.status}`);
      }

      const data = (await res.json()) as RunSummary[];
      setRuns(data);
    } catch (err: any) {
      setApiError(err.message);
    }
  };

  const loadGeoJson = async () => {
    try {
      setGeoError(null);

      const res = await fetch(GEOJSON_PATH);

      if (!res.ok) {
        throw new Error("sri_lanka_districts.geojson not found in public/");
      }

      const data = await res.json();
      setDistrictGeo(data);
    } catch (err: any) {
      setGeoError(err.message);
    }
  };

  const fetchDashboardData = async () => {
    try {
      setApiError(null);
      setLoading(true);

      const nowIso = new Date().toISOString();
      const startIso = dateRangeToStartTs(dateRange);

      const currentRes = await fetch(
        `${API_BASE_URL}/api/dashboard/summary?${makeParams(
          startIso,
          nowIso,
          false
        ).toString()}`
      );

      if (!currentRes.ok) {
        throw new Error(`Dashboard API error: ${currentRes.status}`);
      }

      const currentData =
        (await currentRes.json()) as DashboardSummaryResponse;

      setSummary(currentData);

      if (rangeMs && startIso) {
        const prevStart = new Date(
          new Date(startIso).getTime() - rangeMs
        ).toISOString();

        const prevRes = await fetch(
          `${API_BASE_URL}/api/dashboard/summary?${makeParams(
            prevStart,
            startIso,
            false
          ).toString()}`
        );

        if (prevRes.ok) {
          const prevData =
            (await prevRes.json()) as DashboardSummaryResponse;
          setPrevSummary(prevData);
        } else {
          setPrevSummary(null);
        }
      } else {
        setPrevSummary(null);
      }

      const pointsParams = makeParams(startIso, nowIso, true);
      pointsParams.set("limit", "3000");

      const pointsRes = await fetch(
        `${API_BASE_URL}/api/dashboard/points?${pointsParams.toString()}`
      );

      if (pointsRes.ok) {
        const pointData = (await pointsRes.json()) as DashboardPoint[];
        setPoints(pointData);
      } else {
        setPoints([]);
      }
    } catch (err: any) {
      setApiError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
    loadGeoJson();
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [selectedRunId, selectedOperator, selectedDistrict, threshold, dateRange]);

  const districtStats = summary?.district_stats ?? [];

  const activeDistricts = districtStats.filter((d) => d.totalSamples > 0);

  const worstDistricts = [...activeDistricts]
    .sort((a, b) => b.weakPercent - a.weakPercent)
    .slice(0, 8);

  const avgRsrp = summary?.avg_rsrp ?? null;
  const prevAvgRsrp = prevSummary?.avg_rsrp ?? null;

  const weakCoverage = summary?.weak_coverage_percent ?? 0;
  const prevWeakCoverage = prevSummary?.weak_coverage_percent ?? 0;

  const criticalDistricts = activeDistricts.filter(
    (d) => d.weakPercent > 45
  ).length;

  const prevCriticalDistricts =
    prevSummary?.district_stats?.filter(
      (d) => d.totalSamples > 0 && d.weakPercent > 45
    ).length ?? 0;

  const goodDistricts = activeDistricts.filter(
    (d) => d.weakPercent <= 10
  ).length;

  const provinceSummary = useMemo(() => {
    const groups: Record<string, DistrictStat[]> = {};

    activeDistricts.forEach((d) => {
      if (!groups[d.province]) groups[d.province] = [];
      groups[d.province].push(d);
    });

    return Object.entries(groups).map(([province, districts]) => ({
      province,
      weakPercent: Math.round(
        districts.reduce((sum, d) => sum + d.weakPercent, 0) / districts.length
      ),
      districts: districts.length,
    }));
  }, [activeDistricts]);

  const deltaBadge = (value: number | null, suffix: string) => {
    if (value === null || Number.isNaN(value)) return null;

    const sign = value > 0 ? "▲" : value < 0 ? "▼" : "•";
    const cls = value > 0 ? "delta up" : value < 0 ? "delta down" : "delta flat";
    const abs = Math.abs(Number(value.toFixed(1)));

    return (
      <span className={cls}>
        {suffix === "dBm" ? `${sign} ${abs} ${suffix}` : `${sign} ${abs}${suffix}`}
      </span>
    );
  };

  const deltas = {
    avgDelta:
      avgRsrp !== null && prevAvgRsrp !== null
        ? Number((avgRsrp - prevAvgRsrp).toFixed(1))
        : null,
    weakDelta: Number((weakCoverage - prevWeakCoverage).toFixed(1)),
    criticalDelta: criticalDistricts - prevCriticalDistricts,
  };

  return (
    <Layout
      title="Network Drive Testing Dashboard"
      topbarRight={
        <>
          <select
            className="nt-pill"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRangeId)}
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
            <option>All Districts</option>
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
                  setSelectedOperator((v) => (v === op ? null : op))
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
                setSelectedDistrict("All Districts");
                setSelectedOperator(null);
                setThreshold(-110);
                setDateRange("7d");
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

            {runs.length ? (
              runs.map((r) => (
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
            <span>
              <i className="dot excellent" />
              Excellent
            </span>
            <span>
              <i className="dot good" />
              Good
            </span>
            <span>
              <i className="dot fair" />
              Fair
            </span>
            <span>
              <i className="dot poor" />
              Poor
            </span>
          </div>
        </div>

        <div className="map-layout">
          <div className="sl-map-wrapper">
            {districtGeo ? (
              <MapBoxCoverageMap
                geoJson={districtGeo}
                districtStats={districtStats}
                points={points}
                selectedDistrict={selectedDistrict}
                onSelectDistrict={setSelectedDistrict}
              />
            ) : (
              <p>Loading map...</p>
            )}
          </div>

          <aside className="map-side">
            <h3>WEAK % SCALE</h3>
            <p>
              <i className="dot excellent" />
              &lt; 10%
            </p>
            <p>
              <i className="dot good" />
              10–25%
            </p>
            <p>
              <i className="dot fair" />
              25–45%
            </p>
            <p>
              <i className="dot poor" />
              &gt; 45%
            </p>

            <h3>QUICK JUMP</h3>
            {worstDistricts.slice(0, 5).map((d) => (
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

        <div className="rank-header">
          <span>#</span>
          <span>District</span>
          <span>% Weak</span>
          <span>Median RSRP</span>
          <span />
        </div>

        {worstDistricts.map((d, index) => (
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
          {provinceSummary.map((p) => (
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