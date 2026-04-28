import { useEffect, useMemo, useState } from "react";
import * as d3 from "d3";
import "./App.css";
import SriLankaChoropleth from "./SriLankaChoropleth";

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
}

const GEOJSON_PATH = "/sri_lanka_districts.geojson";
const API_BASE_URL = "http://localhost:8000";
const RUN_ID = "run_test_001";

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

export default function App() {
  const [points, setPoints] = useState<DashboardPoint[]>([]);
  const [districtGeo, setDistrictGeo] = useState<any>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(-110);

  const fetchDashboardData = async () => {
    try {
      setApiError(null);

      const res = await fetch(
        `${API_BASE_URL}/api/dashboard/summary?run_id=${RUN_ID}`
      );

      if (!res.ok) throw new Error(`API error: ${res.status}`);

      const data = await res.json();
      setPoints(data.points ?? []);
    } catch (err: any) {
      setApiError(err.message);
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
    fetchDashboardData();
    loadGeoJson();
  }, []);

  const validPoints = useMemo(() => {
    return points.filter(
      (p) =>
        p.lat !== null &&
        p.lon !== null &&
        p.rsrp_dbm !== null &&
        !Number.isNaN(p.lat) &&
        !Number.isNaN(p.lon)
    );
  }, [points]);

  const avgRsrp = useMemo(() => {
    if (!validPoints.length) return null;
    return Math.round(
      validPoints.reduce((sum, p) => sum + (p.rsrp_dbm ?? 0), 0) /
        validPoints.length
    );
  }, [validPoints]);

  const weakCoverage = useMemo(() => {
    if (!validPoints.length) return 0;
    const weak = validPoints.filter((p) => (p.rsrp_dbm ?? 0) <= threshold);
    return Math.round((weak.length / validPoints.length) * 100);
  }, [validPoints, threshold]);

  const districtStats: DistrictStat[] = useMemo(() => {
    if (!districtGeo || !validPoints.length) return [];

    return districtGeo.features.map((feature: any) => {
      const name = getDistrictName(feature);
      const province = getProvinceName(feature);

      const dPoints = validPoints.filter((p) =>
        d3.geoContains(feature, [p.lon as number, p.lat as number])
      );

      const weak = dPoints.filter((p) => (p.rsrp_dbm ?? 0) <= threshold);

      const avg =
        dPoints.length > 0
          ? Math.round(
              dPoints.reduce((sum, p) => sum + (p.rsrp_dbm ?? 0), 0) /
                dPoints.length
            )
          : null;

      return {
        districtName: name,
        province,
        totalSamples: dPoints.length,
        weakPercent: dPoints.length
          ? Math.round((weak.length / dPoints.length) * 100)
          : 0,
        avgRsrp: avg,
      };
    });
  }, [districtGeo, validPoints, threshold]);

  const activeDistricts = districtStats.filter((d) => d.totalSamples > 0);

  const worstDistricts = [...activeDistricts]
    .sort((a, b) => b.weakPercent - a.weakPercent)
    .slice(0, 8);

  const criticalDistricts = activeDistricts.filter(
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

  return (
    <div className="dashboard-page">
      <main className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">NETWORK DRIVE TESTING DASHBOARD</p>
            <h1>NETRACK IoT Analytics</h1>
          </div>

          <button className="refresh-btn" onClick={fetchDashboardData}>
            Refresh
          </button>
        </header>

        <section className="filter-bar">
          <span>DISTRICT</span>
          <select>
            <option>All Districts</option>
          </select>

          <span>MNO</span>
          <button className="mno dialog">Dialog</button>
          <button className="mno mobitel">Mobitel</button>
          <button className="mno airtel">Airtel</button>
          <button className="mno hutch">Hutch</button>

          <span>THRESHOLD</span>
          <input
            type="range"
            min="-125"
            max="-80"
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />
          <strong>{threshold} dBm</strong>
        </section>

        {apiError && <div className="error-card">API Error: {apiError}</div>}
        {geoError && <div className="error-card">Map Error: {geoError}</div>}

        <section className="kpi-grid">
          <div className="kpi-card">
            <p>TOTAL DISTRICTS</p>
            <h2>{districtGeo?.features?.length ?? 0}</h2>
            <small>Sri Lanka coverage</small>
          </div>

          <div className="kpi-card">
            <p>AVG RSRP</p>
            <h2 className="yellow">{avgRsrp ?? "N/A"} dBm</h2>
            <small>National average</small>
          </div>

          <div className="kpi-card">
            <p>% WEAK COVERAGE</p>
            <h2 className="orange">{weakCoverage}%</h2>
            <small>&lt; {threshold} dBm threshold</small>
          </div>

          <div className="kpi-card">
            <p>DISTRICTS BELOW THRESHOLD</p>
            <h2 className="red">{criticalDistricts}</h2>
            <small>Require intervention</small>
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
          </div>

          {worstDistricts.map((d, index) => (
            <div className="rank-row" key={d.districtName}>
              <span>{index + 1}</span>
              <strong>
                <i className="dot poor"></i>
                {d.districtName}
                <small>{d.province}</small>
              </strong>
              <em>{d.weakPercent}%</em>
              <span>{d.avgRsrp ?? "N/A"} dBm</span>
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