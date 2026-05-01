import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";

const API_BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL || "http://localhost:8000";

const GEOJSON_PATH = "/sri_lanka_districts.geojson";

type DateRangeId = "24h" | "7d" | "30d" | "all";
type OperatorFilter = "all" | "Dialog" | "Mobitel" | "Hutch";

interface RunSummary {
  run_id: string;
  vehicle_id?: string;
  operator?: string;
  point_count?: number;
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
  pci?: number | null;
  earfcn?: number | null;
  band?: string | null;
  lat: number | null;
  lon: number | null;
  district?: string;
  province?: string;
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

export default function DataTable() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);

  const [selectedRunId, setSelectedRunId] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("all");
  const [selectedOperator, setSelectedOperator] =
    useState<OperatorFilter>("all");
  const [dateRange, setDateRange] = useState<DateRangeId>("7d");

  const [records, setRecords] = useState<DashboardPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(500);

  const fetchRuns = async () => {
    const res = await fetch(`${API_BASE_URL}/api/runs`);
    if (!res.ok) throw new Error(`Runs API error ${res.status}`);
    const data = (await res.json()) as RunSummary[];
    setRuns(data);
  };

  const loadDistricts = async () => {
    const res = await fetch(GEOJSON_PATH);
    if (!res.ok) throw new Error("District GeoJSON not found");

    const data = await res.json();

    const names = (data.features ?? [])
      .map((f: any) => getDistrictName(f))
      .sort((a: string, b: string) => a.localeCompare(b));

    setDistricts(names);
  };

  const fetchRecords = async () => {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams();

      if (selectedRunId) params.set("run_id", selectedRunId);
      if (selectedOperator !== "all") params.set("operator", selectedOperator);
      if (selectedDistrict !== "all") params.set("district", selectedDistrict);

      const startTs = dateRangeToStartTs(dateRange);
      if (startTs) params.set("start_ts", startTs);

      params.set("limit", String(limit));

      const res = await fetch(
        `${API_BASE_URL}/api/dashboard/points?${params.toString()}`
      );

      if (!res.ok) throw new Error(`Records API error ${res.status}`);

      const data = (await res.json()) as DashboardPoint[];
      setRecords(data);
    } catch (err: any) {
      setError(err.message || "Failed to load records");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns().catch((err) => setError(err.message));
    loadDistricts().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [selectedRunId, selectedDistrict, selectedOperator, dateRange, limit]);

  const filteredRecords = useMemo(() => {
    if (!search.trim()) return records;

    const q = search.toLowerCase();

    return records.filter((r) =>
      [
        r.run_id,
        r.operator,
        r.district,
        r.province,
        r.cell_id,
        r.band,
        r.ts_utc,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [records, search]);

  return (
    <Layout title="Data Table" activePage="data-table">
      <div className="route-page">
        <section className="nt-filters">
          <div className="nt-filter">
            <label>RUN</label>
            <select
              className="nt-pill"
              value={selectedRunId}
              onChange={(e) => setSelectedRunId(e.target.value)}
            >
              <option value="">All Runs</option>
              {runs.map((r) => (
                <option key={r.run_id} value={r.run_id}>
                  {r.run_id}
                </option>
              ))}
            </select>
          </div>

          <div className="nt-filter">
            <label>DISTRICT</label>
            <select
              className="nt-pill"
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
            >
              <option value="all">All Districts</option>
              {districts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div className="nt-filter">
            <label>OPERATOR</label>
            <select
              className="nt-pill"
              value={selectedOperator}
              onChange={(e) =>
                setSelectedOperator(e.target.value as OperatorFilter)
              }
            >
              <option value="all">All Operators</option>
              <option value="Dialog">Dialog</option>
              <option value="Mobitel">Mobitel</option>
              <option value="Hutch">Hutch</option>
            </select>
          </div>

          <div className="nt-filter">
            <label>TIME RANGE</label>
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
          </div>

          <div className="nt-filter">
            <label>LIMIT</label>
            <select
              className="nt-pill"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            >
              <option value={250}>250</option>
              <option value={500}>500</option>
              <option value={1000}>1000</option>
              <option value={2500}>2500</option>
            </select>
          </div>

          <div className="nt-filter grow">
            <label>SEARCH</label>
            <input
              className="nt-pill"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search run, cell, district..."
            />
          </div>
        </section>

        {error && <div className="error-card">API Error: {error}</div>}

        <section className="ranking-card">
          <div className="section-title">
            <div>
              <h2>All Records</h2>
              <p>
                {loading
                  ? "Loading..."
                  : `${filteredRecords.length} records shown`}
              </p>
            </div>

            <button className="nt-pill" type="button" onClick={fetchRecords}>
              {loading ? "…" : "Refresh"}
            </button>
          </div>

          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Run</th>
                  <th>District</th>
                  <th>Operator</th>
                  <th>RSRP</th>
                  <th>RSRQ</th>
                  <th>SINR</th>
                  <th>Cell ID</th>
                  <th>PCI</th>
                  <th>EARFCN</th>
                  <th>Band</th>
                  <th>Lat</th>
                  <th>Lon</th>
                </tr>
              </thead>

              <tbody>
                {filteredRecords.map((r, index) => (
                  <tr key={`${r.id}-${index}`}>
                    <td>{new Date(r.ts_utc).toLocaleString()}</td>
                    <td>{r.run_id ?? "N/A"}</td>
                    <td>{r.district ?? "N/A"}</td>
                    <td>{r.operator ?? "N/A"}</td>
                    <td>{r.rsrp_dbm ?? "N/A"}</td>
                    <td>{r.rsrq_db ?? "N/A"}</td>
                    <td>{r.sinr_db ?? "N/A"}</td>
                    <td>{r.cell_id ?? "N/A"}</td>
                    <td>{r.pci ?? "N/A"}</td>
                    <td>{r.earfcn ?? "N/A"}</td>
                    <td>{r.band ?? "N/A"}</td>
                    <td>{r.lat ?? "N/A"}</td>
                    <td>{r.lon ?? "N/A"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Layout>
  );
}