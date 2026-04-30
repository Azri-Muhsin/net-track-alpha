import { useEffect, useMemo, useState } from "react";
import "./App.css";

import RouteAnalysis from "./pages/RouteAnalysis";
import HomePage from "./pages/HomePage";

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

  avgRsrq: number | null;
  avgSinr: number | null;
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
type OperatorFilter = "all" | "Dialog" | "Mobitel" | "Hutch";

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
  const [currentPage, setCurrentPage] = useState<"dashboard" | "route-analysis">(
    "dashboard"
  );

  const [districtGeo, setDistrictGeo] = useState<any>(null);
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [prevSummary, setPrevSummary] =
    useState<DashboardSummaryResponse | null>(null);

  const [points, setPoints] = useState<DashboardPoint[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);

  const [selectedRunId, setSelectedRunId] = useState("");
  const [selectedOperator, setSelectedOperator] =
    useState<OperatorFilter>("all");
  const [selectedDistrict, setSelectedDistrict] = useState("all");
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

    if (selectedRunId) {
      p.set("run_id", selectedRunId);
    }

    if (selectedOperator !== "all") {
      p.set("operator", selectedOperator);
    }

    if (includeDistrict && selectedDistrict !== "all") {
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

  useEffect(() => {
    const handleSidebarClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const clickedItem = target.closest("div");
      const text = clickedItem?.textContent?.trim();

      if (text?.includes("Route Analysis")) {
        setCurrentPage("route-analysis");
      }

      if (text?.includes("Overview")) {
        setCurrentPage("dashboard");
      }
    };

    document.addEventListener("click", handleSidebarClick);

    return () => {
      document.removeEventListener("click", handleSidebarClick);
    };
  }, []);

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
        districts.reduce((sum, d) => sum + d.weakPercent, 0) /
          districts.length
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
        {suffix === "dBm"
          ? `${sign} ${abs} ${suffix}`
          : `${sign} ${abs}${suffix}`}
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

  if (currentPage === "route-analysis") {
    return <RouteAnalysis />;
  }

  return (
    <HomePage
      districtGeo={districtGeo}
      districtStats={districtStats}
      points={points}
      runs={runs}
      selectedRunId={selectedRunId}
      setSelectedRunId={setSelectedRunId}
      selectedOperator={selectedOperator}
      setSelectedOperator={setSelectedOperator}
      selectedDistrict={selectedDistrict}
      setSelectedDistrict={setSelectedDistrict}
      dateRange={dateRange}
      setDateRange={setDateRange}
      threshold={threshold}
      setThreshold={setThreshold}
      apiError={apiError}
      geoError={geoError}
      loading={loading}
      fetchDashboardData={fetchDashboardData}
      getDistrictName={getDistrictName}
      worstDistricts={worstDistricts}
      avgRsrp={avgRsrp}
      weakCoverage={weakCoverage}
      criticalDistricts={criticalDistricts}
      goodDistricts={goodDistricts}
      provinceSummary={provinceSummary}
      deltaBadge={deltaBadge}
      deltas={deltas}
    />
  );
}