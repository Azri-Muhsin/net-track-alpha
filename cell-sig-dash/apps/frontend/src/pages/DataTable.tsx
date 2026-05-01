import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import { useTheme } from "../lib/ThemeContext";

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
  const { colors } = useTheme();

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

  const [limit, setLimit] = useState<number | "all">("all");

  const [sortField, setSortField] = useState<keyof DashboardPoint>("ts_utc");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const cardStyle: React.CSSProperties = {
    background: colors.glassBg,
    borderColor: colors.border,
    color: colors.text,
  };

  const inputStyle: React.CSSProperties = {
    background: colors.glassBg,
    borderColor: colors.border,
    color: colors.text,
  };

  const mutedStyle: React.CSSProperties = {
    color: colors.textSecondary,
  };

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

      if (limit === "all") {
        params.set("limit", "100000");
      } else {
        params.set("limit", String(limit));
      }

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

  const handleSort = (field: keyof DashboardPoint) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const filteredRecords = useMemo(() => {
    return [...records].sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];

      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;

      const result =
        typeof aValue === "number" && typeof bValue === "number"
          ? aValue - bValue
          : String(aValue).localeCompare(String(bValue));

      return sortDirection === "asc" ? result : -result;
    });
  }, [records, sortField, sortDirection]);

  const tableHeaderStyle: React.CSSProperties = {
    color: colors.textSecondary,
    borderBottomColor: colors.border,
  };

  const tableCellStyle: React.CSSProperties = {
    color: colors.text,
    borderBottomColor: colors.border,
  };

  return (
    <Layout title="Data Table" currentPage="data-table" onNavigate={() => {}}>
      <div className="route-page" style={{ color: colors.text }}>
        <section
          className="nt-filters"
          style={{ borderBottomColor: colors.border }}
        >
          <div className="nt-filter">
            <label style={mutedStyle}>RUN</label>
            <select
              className="nt-pill"
              value={selectedRunId}
              onChange={(e) => setSelectedRunId(e.target.value)}
              style={inputStyle}
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
            <label style={mutedStyle}>DISTRICT</label>
            <select
              className="nt-pill"
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
              style={inputStyle}
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
            <label style={mutedStyle}>OPERATOR</label>
            <select
              className="nt-pill"
              value={selectedOperator}
              onChange={(e) =>
                setSelectedOperator(e.target.value as OperatorFilter)
              }
              style={inputStyle}
            >
              <option value="all">All Operators</option>
              <option value="Dialog">Dialog</option>
              <option value="Mobitel">Mobitel</option>
              <option value="Hutch">Hutch</option>
            </select>
          </div>

          <div className="nt-filter">
            <label style={mutedStyle}>TIME RANGE</label>
            <select
              className="nt-pill"
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as DateRangeId)}
              style={inputStyle}
            >
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="all">All Time</option>
            </select>
          </div>

          <div className="nt-filter">
            <label style={mutedStyle}>LIMIT</label>
            <select
              className="nt-pill"
              value={limit}
              onChange={(e) =>
                setLimit(e.target.value === "all" ? "all" : Number(e.target.value))
              }
              style={inputStyle}
            >
              <option value={250}>250</option>
              <option value={500}>500</option>
              <option value={1000}>1000</option>
              <option value={2500}>2500</option>
              <option value="all">All Records</option>
            </select>
          </div>
        </section>

        {error && <div className="error-card">API Error: {error}</div>}

        <section className="ranking-card" style={cardStyle}>
          <div className="section-title">
            <div>
              <h2 style={{ color: colors.text }}>All Records</h2>
              <p style={mutedStyle}>
                {loading
                  ? "Loading..."
                  : `${filteredRecords.length} records shown`}
              </p>
            </div>

            <button
              className="nt-pill"
              type="button"
              onClick={fetchRecords}
              style={inputStyle}
            >
              {loading ? "…" : "Refresh"}
            </button>
          </div>

          <div className="data-table-wrap">
            <table className="data-table" style={{ color: colors.text }}>
              <thead>
                <tr>
                  <th style={tableHeaderStyle} onClick={() => handleSort("ts_utc")}>Time</th>
                  <th style={tableHeaderStyle} onClick={() => handleSort("run_id")}>Run</th>
                  <th style={tableHeaderStyle} onClick={() => handleSort("district")}>District</th>
                  <th style={tableHeaderStyle} onClick={() => handleSort("operator")}>Operator</th>
                  <th style={tableHeaderStyle} onClick={() => handleSort("rsrp_dbm")}>RSRP</th>
                  <th style={tableHeaderStyle} onClick={() => handleSort("rsrq_db")}>RSRQ</th>
                  <th style={tableHeaderStyle} onClick={() => handleSort("sinr_db")}>SINR</th>
                  <th style={tableHeaderStyle} onClick={() => handleSort("cell_id")}>Cell ID</th>
                  <th style={tableHeaderStyle} onClick={() => handleSort("pci")}>PCI</th>
                  <th style={tableHeaderStyle} onClick={() => handleSort("earfcn")}>EARFCN</th>
                  <th style={tableHeaderStyle} onClick={() => handleSort("band")}>Band</th>
                  <th style={tableHeaderStyle} onClick={() => handleSort("lat")}>Lat</th>
                  <th style={tableHeaderStyle} onClick={() => handleSort("lon")}>Lon</th>
                </tr>
              </thead>

              <tbody>
                {filteredRecords.map((r, index) => (
                  <tr key={`${r.id}-${index}`}>
                    <td style={tableCellStyle}>{new Date(r.ts_utc).toLocaleString()}</td>
                    <td style={tableCellStyle}>{r.run_id ?? "N/A"}</td>
                    <td style={tableCellStyle}>{r.district ?? "N/A"}</td>
                    <td style={tableCellStyle}>
                      <span
                        className={`operator-badge operator-${(r.operator ?? "unknown")
                          .toLowerCase()
                          .trim()}`}
                      >
                        {r.operator ?? "N/A"}
                      </span>
                    </td>
                    <td style={tableCellStyle}>
                      <span
                        className={`signal-badge ${
                          r.rsrp_dbm == null
                            ? "signal-unknown"
                            : r.rsrp_dbm <= -110
                            ? "signal-bad"
                            : r.rsrp_dbm <= -100
                            ? "signal-fair"
                            : "signal-good"
                        }`}
                      >
                        {r.rsrp_dbm ?? "N/A"}
                      </span>
                    </td>
                    <td style={tableCellStyle}>{r.rsrq_db ?? "N/A"}</td>
                    <td style={tableCellStyle}>{r.sinr_db ?? "N/A"}</td>
                    <td style={tableCellStyle}>{r.cell_id ?? "N/A"}</td>
                    <td style={tableCellStyle}>{r.pci ?? "N/A"}</td>
                    <td style={tableCellStyle}>{r.earfcn ?? "N/A"}</td>
                    <td style={tableCellStyle}>{r.band ?? "N/A"}</td>
                    <td style={tableCellStyle}>{r.lat ?? "N/A"}</td>
                    <td style={tableCellStyle}>{r.lon ?? "N/A"}</td>
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