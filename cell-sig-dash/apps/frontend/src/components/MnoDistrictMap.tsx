import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl, { GeoJSONSource } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

interface Props {
  geoJson: any; // Sri Lanka districts GeoJSON
  operator?: string;
}

interface MnoStat {
  district: string;
  avgRsrp: number;
  count: number;
}

const MAPBOX_TOKEN = (import.meta as any).env?.VITE_MAPBOX_TOKEN ?? "";
const API_BASE =
  (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:8000";

function cleanName(name: string) {
  return name?.replace(" District", "").trim().toLowerCase();
}

function getRsrpColor(rsrp: number | null) {
  if (rsrp == null) return "#374151";
  if (rsrp >= -70) return "#1a9850";
  if (rsrp >= -80) return "#66bd63";
  if (rsrp >= -90) return "#fee08b";
  if (rsrp >= -100) return "#fc8d59";
  if (rsrp >= -110) return "#f46d43";
  return "#d73027";
}

export default function MnoDistrictMap({
  geoJson,
  operator = "Dialog",
}: Props) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [stats, setStats] = useState<MnoStat[]>([]);
  const [loading, setLoading] = useState(false);

  // ---------------- FETCH MNO DATA ----------------
  const fetchStats = useCallback(async () => {
    const res = await fetch(
      `${API_BASE}/api/mno/district?operator=${operator}`
    );

    const data = await res.json();
    return data?.data ?? [];
  }, [operator]);

  // ---------------- INIT MAP ----------------
  useEffect(() => {
    if (!containerRef.current || !geoJson?.features) return;
    if (!MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [80.7718, 7.8731],
      zoom: 6.7,
      minZoom: 5,
      maxZoom: 16,
    });

    mapRef.current = map;

    map.on("load", async () => {
      console.log("MNO MAP LOADED");

      setLoading(true);

      const mnoStats = await fetchStats();
      setStats(mnoStats);

      // ---------------- MERGE DATA ----------------
      const statsMap = new Map<string, MnoStat>();
      mnoStats.forEach((d: MnoStat) => {
        statsMap.set(cleanName(d.district), d);
      });

      const mergedGeoJson = {
        type: "FeatureCollection",
        features: geoJson.features.map((f: any) => {
          const name =
            f.properties.NAME_2 ||
            f.properties.shapeName ||
            f.properties.name;

          const stat = statsMap.get(cleanName(name));

          return {
            ...f,
            properties: {
              ...f.properties,
              avgRsrp: stat?.avgRsrp ?? null,
              count: stat?.count ?? 0,
              color: getRsrpColor(stat?.avgRsrp ?? null),
            },
          };
        }),
      };

      // ---------------- SOURCE ----------------
      map.addSource("districts", {
        type: "geojson",
        data: mergedGeoJson as any,
      });

      // ---------------- CHOROPLETH ----------------
      map.addLayer({
        id: "district-fill",
        type: "fill",
        source: "districts",
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": 0.75,
        },
      });

      map.addLayer({
        id: "district-border",
        type: "line",
        source: "districts",
        paint: {
          "line-color": "#ffffff",
          "line-width": 1,
        },
      });

      // ---------------- CLICK POPUP ----------------
      map.on("click", "district-fill", (e) => {
        const f = e.features?.[0];
        if (!f) return;

        const p = f.properties as any;

        new mapboxgl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-family: Inter;">
              <strong>${p.NAME_2}</strong><br/>
              Avg RSRP: ${p.avgRsrp?.toFixed(1) ?? "N/A"} dBm<br/>
              Samples: ${p.count}
            </div>
          `)
          .addTo(map);
      });

      map.resize();
      setLoading(false);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [geoJson, fetchStats]);

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "620px",
          borderRadius: "16px",
          overflow: "hidden",
          background: "#111827",
        }}
      />

      {loading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.5)",
            color: "white",
            fontWeight: 600,
          }}
        >
          Loading MNO Comparison...
        </div>
      )}
    </div>
  );
}