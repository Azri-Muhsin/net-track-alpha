import { useEffect, useMemo, useState } from "react";
import * as d3 from "d3";
import "./App.css";
import SriLankaChoropleth from "./SriLankaChoropleth";
import React from "react";
import logo from "./assets/NetTrack_svg.svg";

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

const GEOJSON_PATH = "/sri_lanka_districts.geojson";
const API_BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL || "http://localhost:8000";

type DateRangeId = "24h" | "7d" | "30d" | "all";

interface RunSummary {
  run_id: string;
  vehicle_id?: string;
  operator?: string;
  start_time?: string;
  end_time?: string;
  point_count?: number;
}

interface DashboardSummaryResponse {
  run_id: string | null;
  operator: string | null;
  threshold: number;
  total_samples: number;
  avg_rsrp: number | null;
  weak_coverage_percent: number;
  critical_count: number;
  points: DashboardPoint[];
}

function getDistrictName(feature: any) {
  const raw =
    feature.properties.shapeName ||
    feature.properties.NAME_2 ||
    feature.properties.district ||
    feature.properties.name ||
    "Unknown";

  return raw.replace(" District", "").trim();
}

function getProvinceName(feature: any) {
  return (
    feature.properties.shapeGroup ||
    feature.properties.province ||
    feature.properties.NAME_1 ||
    "Sri Lanka"
  );
}

function cleanName(name: string) {
  return name.replace(" District", "").trim().toLowerCase();
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
  const [points, setPoints] = useState<DashboardPoint[]>([]);
  const [prevPoints, setPrevPoints] = useState<DashboardPoint[]>([]);
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [prevSummary, setPrevSummary] = useState<DashboardSummaryResponse | null>(null);
  const [districtGeo, setDistrictGeo] = useState<any>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(-110);
  const [loading, setLoading] = useState(false);

  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [selectedOperator, setSelectedOperator] = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<string>("All Districts");
  const [dateRange, setDateRange] = useState<DateRangeId>("7d");

  const rangeMs = useMemo(() => {
    if (dateRange === "all") return null;
    if (dateRange === "24h") return 24 * 60 * 60 * 1000;
    if (dateRange === "7d") return 7 * 24 * 60 * 60 * 1000;
    return 30 * 24 * 60 * 60 * 1000;
  }, [dateRange]);

  const fetchRuns = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/runs`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = (await res.json()) as RunSummary[];
      setRuns(data);
      if (!selectedRunId && data?.length) {
        setSelectedRunId(data[0].run_id);
      }
    } catch (err: any) {
      setApiError(err.message);
    }
  };

  const fetchDashboardData = async () => {
    try {
      setApiError(null);
      setLoading(true);

      const nowIso = new Date().toISOString();
      const startIso = dateRangeToStartTs(dateRange);

      const makeParams = (start_ts?: string | null, end_ts?: string | null) => {
        const p = new URLSearchParams();
        if (selectedRunId) p.set("run_id", selectedRunId);
        if (selectedOperator) p.set("operator", selectedOperator);
        if (selectedDistrict && selectedDistrict !== "All Districts") {
          p.set("district", selectedDistrict);
        }
        p.set("threshold", String(threshold));
        p.set("limit", "20000");
        if (start_ts) p.set("start_ts", start_ts);
        if (end_ts) p.set("end_ts", end_ts);
        return p;
      };

      const currentRes = await fetch(
        `${API_BASE_URL}/api/dashboard/summary?${makeParams(startIso, nowIso).toString()}`
      );
      if (!currentRes.ok) throw new Error(`API error: ${currentRes.status}`);
      const currentData = (await currentRes.json()) as DashboardSummaryResponse;
      setSummary(currentData);
      setPoints(currentData.points ?? []);

      if (rangeMs && startIso) {
        const prevStart = new Date(new Date(startIso).getTime() - rangeMs).toISOString();
        const prevEnd = startIso;
        const prevRes = await fetch(
          `${API_BASE_URL}/api/dashboard/summary?${makeParams(prevStart, prevEnd).toString()}`
        );
        if (prevRes.ok) {
          const prevData = (await prevRes.json()) as DashboardSummaryResponse;
          setPrevSummary(prevData);
          setPrevPoints(prevData.points ?? []);
        } else {
          setPrevSummary(null);
          setPrevPoints([]);
        }
      } else {
        setPrevSummary(null);
        setPrevPoints([]);
      }
    } catch (err: any) {
      setApiError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadGeoJson = async () => {
    try {
      setGeoError(null);

      const res = await fetch(GEOJSON_PATH);
      if (!res.ok) throw new Error("sri_lanka_districts.geojson not found");

      const data = await res.json();
      setDistrictGeo(data);
    } catch (err: any) {
      setGeoError(err.message);
    }
  };

  useEffect(() => {
    fetchRuns();
    loadGeoJson();
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [selectedRunId, selectedOperator, threshold, dateRange]);

  const selectedDistrictFeature = useMemo(() => {
    if (!districtGeo || selectedDistrict === "All Districts") return null;
    return (
      districtGeo.features.find(
        (f: any) => cleanName(getDistrictName(f)) === cleanName(selectedDistrict)
      ) ?? null
    );
  }, [districtGeo, selectedDistrict]);

  const prevSelectedDistrictFeature = selectedDistrictFeature;

  const validPoints = useMemo(() => {
    const base = points.filter(
      (p) =>
        p.lat !== null &&
        p.lon !== null &&
        p.rsrp_dbm !== null &&
        !Number.isNaN(p.lat) &&
        !Number.isNaN(p.lon)
    );
    if (!selectedDistrictFeature) return base;
    return base.filter((p) =>
      d3.geoContains(selectedDistrictFeature, [p.lon as number, p.lat as number])
    );
  }, [points, selectedDistrictFeature]);

  const prevValidPoints = useMemo(() => {
    const base = prevPoints.filter(
      (p) =>
        p.lat !== null &&
        p.lon !== null &&
        p.rsrp_dbm !== null &&
        !Number.isNaN(p.lat) &&
        !Number.isNaN(p.lon)
    );
    if (!prevSelectedDistrictFeature) return base;
    return base.filter((p) =>
      d3.geoContains(prevSelectedDistrictFeature, [p.lon as number, p.lat as number])
    );
  }, [prevPoints, prevSelectedDistrictFeature]);

  const avgRsrp = useMemo(() => summary?.avg_rsrp ?? null, [summary]);
  const prevAvgRsrp = useMemo(() => prevSummary?.avg_rsrp ?? null, [prevSummary]);
  const weakCoverage = useMemo(() => summary?.weak_coverage_percent ?? 0, [summary]);
  const prevWeakCoverage = useMemo(
    () => prevSummary?.weak_coverage_percent ?? 0,
    [prevSummary]
  );

  const districtStats: DistrictStat[] = useMemo(() => {
    if (!districtGeo || !validPoints.length) return [];

    return districtGeo.features.map((feature: any) => {
      const name = getDistrictName(feature);
      const province = getProvinceName(feature);

      const dPoints = validPoints.filter((p) =>
        d3.geoContains(feature, [p.lon as number, p.lat as number])
      );

      const weak = dPoints.filter((p) => (p.rsrp_dbm ?? 0) <= threshold);

      const rsrpSorted = dPoints
        .map((p) => p.rsrp_dbm)
        .filter((v): v is number => typeof v === "number")
        .slice()
        .sort((a, b) => a - b);

      const avg =
        dPoints.length > 0
          ? Math.round(
              dPoints.reduce((sum, p) => sum + (p.rsrp_dbm ?? 0), 0) /
                dPoints.length
            )
          : null;

      const median =
        rsrpSorted.length === 0
          ? null
          : rsrpSorted.length % 2 === 1
            ? rsrpSorted[(rsrpSorted.length - 1) / 2]
            : Math.round(
                (rsrpSorted[rsrpSorted.length / 2 - 1] +
                  rsrpSorted[rsrpSorted.length / 2]) /
                  2
              );

      return {
        districtName: name,
        province,
        totalSamples: dPoints.length,
        weakPercent: dPoints.length
          ? Math.round((weak.length / dPoints.length) * 100)
          : 0,
        avgRsrp: avg,
        medianRsrp: median,
      };
    });
  }, [districtGeo, validPoints, threshold]);

  const prevDistrictStats: DistrictStat[] = useMemo(() => {
    if (!districtGeo || !prevValidPoints.length) return [];

    return districtGeo.features.map((feature: any) => {
      const name = getDistrictName(feature);
      const province = getProvinceName(feature);

      const dPoints = prevValidPoints.filter((p) =>
        d3.geoContains(feature, [p.lon as number, p.lat as number])
      );

      const weak = dPoints.filter((p) => (p.rsrp_dbm ?? 0) <= threshold);

      const rsrpSorted = dPoints
        .map((p) => p.rsrp_dbm)
        .filter((v): v is number => typeof v === "number")
        .slice()
        .sort((a, b) => a - b);

      const avg =
        dPoints.length > 0
          ? Math.round(
              dPoints.reduce((sum, p) => sum + (p.rsrp_dbm ?? 0), 0) /
                dPoints.length
            )
          : null;

      const median =
        rsrpSorted.length === 0
          ? null
          : rsrpSorted.length % 2 === 1
            ? rsrpSorted[(rsrpSorted.length - 1) / 2]
            : Math.round(
                (rsrpSorted[rsrpSorted.length / 2 - 1] +
                  rsrpSorted[rsrpSorted.length / 2]) /
                  2
              );

      return {
        districtName: name,
        province,
        totalSamples: dPoints.length,
        weakPercent: dPoints.length
          ? Math.round((weak.length / dPoints.length) * 100)
          : 0,
        avgRsrp: avg,
        medianRsrp: median,
      };
    });
  }, [districtGeo, prevValidPoints, threshold]);

  const activeDistricts = districtStats.filter((d) => d.totalSamples > 0);
  const prevActiveDistricts = prevDistrictStats.filter((d) => d.totalSamples > 0);

  const worstDistricts = [...activeDistricts]
    .sort((a, b) => b.weakPercent - a.weakPercent)
    .slice(0, 8);

  const criticalDistricts = activeDistricts.filter(
    (d) => d.weakPercent > 45
  ).length;
  const prevCriticalDistricts = prevActiveDistricts.filter(
    (d) => d.weakPercent > 45
  ).length;

  const goodDistricts = activeDistricts.filter(
    (d) => d.weakPercent <= 10
  ).length;

  const provinceSummary = useMemo(() => {
    const groups: Record<string, DistrictStat[]> = {};

    activeDistricts.forEach((d) => {
      if (!groups[d.province]) groups[d.province] = [];
      groups[d.province].push(d);
    });

    return Object.entries(groups).map(([province, districts]) => {
      const avgWeak = Math.round(
        districts.reduce((sum, d) => sum + d.weakPercent, 0) / districts.length
      );

      return {
        province,
        weakPercent: avgWeak,
        districts: districts.length,
      };
    });
  }, [activeDistricts]);

  const liveCollection = useMemo(() => {
    const run = runs.find((r) => r.run_id === selectedRunId);
    return {
      rigId: run?.vehicle_id || "NTRK-04",
      route: run?.run_id ? `${run.run_id}` : "—",
      samples: run?.point_count ?? points.length ?? 0,
    };
  }, [runs, selectedRunId, points.length]);

  const deltas = useMemo(() => {
    const avgDelta =
      avgRsrp !== null && prevAvgRsrp !== null ? avgRsrp - prevAvgRsrp : null;
    const weakDelta =
      typeof weakCoverage === "number" && typeof prevWeakCoverage === "number"
        ? weakCoverage - prevWeakCoverage
        : null;
    const criticalDelta =
      typeof criticalDistricts === "number" && typeof prevCriticalDistricts === "number"
        ? criticalDistricts - prevCriticalDistricts
        : null;

    return { avgDelta, weakDelta, criticalDelta };
  }, [avgRsrp, prevAvgRsrp, weakCoverage, prevWeakCoverage, criticalDistricts, prevCriticalDistricts]);

  const deltaBadge = (value: number | null, suffix: string) => {
    if (value === null) return null;
    const sign = value > 0 ? "▲" : value < 0 ? "▼" : "•";
    const cls = value > 0 ? "delta up" : value < 0 ? "delta down" : "delta flat";
    const abs = Math.abs(value);
    const text =
      suffix === "dBm"
        ? `${sign} ${abs} ${suffix}`
        : `${sign} ${abs}${suffix}`;
    return <span className={cls}>{text}</span>;
  };

  return (
    <div className="nt-shell">
      <aside className="nt-sidebar">
        <div className="nt-brand">
          <div className="nt-brand-mark">
            <img src={logo} alt="NETRACK" />
          </div>
          <div className="nt-brand-text">
            <div className="nt-brand-name">NETRACK</div>
            <div className="nt-brand-sub">IoT Analytics</div>
          </div>
        </div>

        <nav className="nt-nav">
          <button className="nt-nav-item active" type="button">
            <span className="nt-nav-icon" aria-hidden />
            <span>Overview</span>
          </button>
          <button className="nt-nav-item" type="button">
            <span className="nt-nav-icon" aria-hidden />
            <span>Route Analysis</span>
          </button>
          <button className="nt-nav-item" type="button">
            <span className="nt-nav-icon" aria-hidden />
            <span>MNO Benchmark</span>
          </button>
          <button className="nt-nav-item" type="button">
            <span className="nt-nav-icon" aria-hidden />
            <span>Rig Health</span>
          </button>
          <button className="nt-nav-item" type="button">
            <span className="nt-nav-icon" aria-hidden />
            <span>Data Table</span>
          </button>
        </nav>

        <div className="nt-live">
          <div className="nt-live-dot" aria-hidden />
          <div className="nt-live-meta">
            <div className="nt-live-title">Live Collection</div>
            <div className="nt-live-row">
              <span>Rig ID:</span>
              <strong>{liveCollection.rigId}</strong>
            </div>
            <div className="nt-live-row">
              <span>Route:</span>
              <strong>{liveCollection.route}</strong>
            </div>
            <div className="nt-live-row">
              <span>Samples:</span>
              <strong>{liveCollection.samples.toLocaleString()}</strong>
            </div>
          </div>
        </div>
      </aside>

      <main className="nt-main">
        <header className="nt-topbar">
          <div className="nt-topbar-title">
            <div className="nt-topbar-eyebrow">NETWORK DRIVE TESTING DASHBOARD</div>
          </div>

          <div className="nt-topbar-actions">
            <select
              className="nt-pill"
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as DateRangeId)}
              aria-label="Date range"
            >
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="all">All Time</option>
            </select>

            <button className="nt-iconbtn" type="button" onClick={fetchDashboardData} aria-label="Refresh">
              {loading ? "…" : "⟳"}
            </button>

            <button className="nt-iconbtn" type="button" aria-label="Notifications">
              ◌
            </button>

            <div className="nt-userpill" aria-label="User">
              <div className="nt-user-avatar" aria-hidden />
              <div className="nt-user-meta">
                <div className="nt-user-name">Engineer</div>
                <div className="nt-user-role">Analyst</div>
              </div>
            </div>
          </div>
        </header>

        <section className="nt-filters">
          <div className="nt-filter">
            <label>DISTRICT</label>
            <select
              className="nt-pill"
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
              aria-label="District"
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
              <button
                className={`mno dialog ${selectedOperator === "Dialog" ? "active" : ""}`}
                onClick={() => setSelectedOperator((v) => (v === "Dialog" ? null : "Dialog"))}
                aria-pressed={selectedOperator === "Dialog"}
                type="button"
              >
                Dialog
              </button>
              <button
                className={`mno mobitel ${selectedOperator === "Mobitel" ? "active" : ""}`}
                onClick={() => setSelectedOperator((v) => (v === "Mobitel" ? null : "Mobitel"))}
                aria-pressed={selectedOperator === "Mobitel"}
                type="button"
              >
                Mobitel
              </button>
              <button
                className={`mno airtel ${selectedOperator === "Airtel" ? "active" : ""}`}
                onClick={() => setSelectedOperator((v) => (v === "Airtel" ? null : "Airtel"))}
                aria-pressed={selectedOperator === "Airtel"}
                type="button"
              >
                Airtel
              </button>
              <button
                className={`mno hutch ${selectedOperator === "Hutch" ? "active" : ""}`}
                onClick={() => setSelectedOperator((v) => (v === "Hutch" ? null : "Hutch"))}
                aria-pressed={selectedOperator === "Hutch"}
                type="button"
              >
                Hutch
              </button>
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
                aria-label="Threshold"
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
              aria-label="Run"
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
        </section>

        {apiError && <div className="error-card">API Error: {apiError}</div>}
        {geoError && <div className="error-card">Map Error: {geoError}</div>}

        <section className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-head">
              <p>TOTAL DISTRICTS</p>
              <span className="kpi-icon" aria-hidden>▦</span>
            </div>
            <h2>{districtGeo?.features?.length ?? 0}</h2>
            <small>Sri Lanka coverage</small>
            <div className="kpi-foot">
              <span className="delta up">▲ 0 vs last week</span>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-head">
              <p>AVG RSRP</p>
              <span className="kpi-icon" aria-hidden>≋</span>
            </div>
            <h2 className="yellow">{avgRsrp ?? "N/A"} dBm</h2>
            <small>National average</small>
            <div className="kpi-foot">
              {deltaBadge(deltas.avgDelta, "dBm")}
              <span className="kpi-foot-label">vs last week</span>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-head">
              <p>% WEAK COVERAGE</p>
              <span className="kpi-icon warn" aria-hidden>△</span>
            </div>
            <h2 className="orange">{weakCoverage}%</h2>
            <small>&lt; {threshold} dBm threshold</small>
            <div className="kpi-foot">
              {deltaBadge(deltas.weakDelta, "%")}
              <span className="kpi-foot-label">vs last week</span>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-head">
              <p>DISTRICTS BELOW THRESHOLD</p>
              <span className="kpi-icon bad" aria-hidden>▮</span>
            </div>
            <h2 className="red">{criticalDistricts}</h2>
            <small>Require intervention</small>
            <div className="kpi-foot">
              {deltaBadge(deltas.criticalDelta, "")}
              <span className="kpi-foot-label">vs last week</span>
            </div>
          </div>
        </section>

        <section className="map-card">
          <div className="section-title">
            <div>
              <h2>District Coverage Choropleth</h2>
              <p>RSRP weakness by district — click or hover to inspect</p>
            </div>

            <div className="legend">
              <span><i className="dot excellent"></i>Excellent</span>
              <span><i className="dot good"></i>Good</span>
              <span><i className="dot fair"></i>Fair</span>
              <span><i className="dot poor"></i>Poor</span>
            </div>
          </div>

          <div className="map-layout">
            <div className="sl-map-wrapper">
              {districtGeo ? (
                <SriLankaChoropleth
                  geoJson={districtGeo}
                  districtStats={districtStats}
                  onSelectDistrict={(name) => setSelectedDistrict(name)}
                />
              ) : (
                <p>Loading map...</p>
              )}
            </div>

            <aside className="map-side">
              <h3>WEAK % SCALE</h3>
              <p><i className="dot excellent"></i>&lt; 10%</p>
              <p><i className="dot good"></i>10–25%</p>
              <p><i className="dot fair"></i>25–45%</p>
              <p><i className="dot poor"></i>&gt; 45%</p>

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
            <span></span>
          </div>

          {worstDistricts.map((d, index) => (
            <div className="rank-row" key={d.districtName}>
              <span>{index + 1}</span>
              <strong>
                <i className="dot poor"></i>
                {d.districtName}
                <small>{d.province}</small>
              </strong>
              <div className="rank-weak">
                <em>{d.weakPercent}%</em>
                <div className="rank-bar" aria-hidden>
                  <div className="rank-bar-fill" style={{ width: `${Math.min(100, Math.max(0, d.weakPercent))}%` }} />
                </div>
              </div>
              <span className="rank-median">{d.medianRsrp ?? "N/A"} dBm</span>
              <button className="rank-view" type="button" onClick={() => setSelectedDistrict(d.districtName)}>
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
      </main>
    </div>
  );
}