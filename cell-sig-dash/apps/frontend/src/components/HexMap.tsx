import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import { latLngToCell, cellToBoundary } from "h3-js";

import "mapbox-gl/dist/mapbox-gl.css";

const MAPBOX_TOKEN = (import.meta as any).env?.VITE_MAPBOX_TOKEN ?? "";
const API_BASE =
  (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:8000";

const H3_RESOLUTION = 10;

interface RawFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    rsrp?: number;
    sinr?: number;
  };
}

// ---------------- COLORS ----------------
function rsrpToColor(rsrp: number) {
  if (rsrp >= -70) return "#1a9850";
  if (rsrp >= -80) return "#66bd63";
  if (rsrp >= -90) return "#fee08b";
  if (rsrp >= -100) return "#fc8d59";
  if (rsrp >= -110) return "#f46d43";
  return "#d73027";
}

// ---------------- H3 GRID ----------------
function buildH3(features: RawFeature[]) {
  const bins = new Map<string, number[]>();

  for (const f of features ?? []) {
    if (!f?.geometry) continue;

    const [lon, lat] = f.geometry.coordinates;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const cell = latLngToCell(lat, lon, H3_RESOLUTION);

    if (!bins.has(cell)) bins.set(cell, []);
    if (f.properties?.rsrp != null) bins.get(cell)!.push(f.properties.rsrp);
  }

  const out: any[] = [];

  for (const [cell, values] of bins.entries()) {
    const boundary = cellToBoundary(cell).map(([lat, lng]) => [lng, lat]);
    boundary.push(boundary[0]);

    const avg =
      values.reduce((a, b) => a + b, 0) / values.length;

    out.push({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [boundary],
      },
      properties: {
        avgRsrp: avg,
        count: values.length,
        color: rsrpToColor(avg),
      },
    });
  }

  return {
    type: "FeatureCollection",
    features: out,
  };
}

// ---------------- COMPONENT ----------------
export default function HexMap({ operator = "Dialog" }: { operator?: string }) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rawData = useRef<RawFeature[]>([]);
  const [loading, setLoading] = useState(false);

  // ---------------- FETCH ----------------
  const fetchData = useCallback(async () => {
    const res = await fetch(
      `${API_BASE}/api/hexbin/district?operator=${operator}`
    );

    const data = await res.json();
    console.log("HEX API:", data.features?.length);

    return data.features ?? [];
  }, [operator]);

  // ---------------- UPDATE MAP ----------------
  const updateMap = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!map.isStyleLoaded()) {
      console.warn("Style not ready");
      return;
    }

    const source = map.getSource("hexbins") as mapboxgl.GeoJSONSource;
    if (!source) {
      console.warn("Source missing");
      return;
    }

    const geojson = buildH3(rawData.current);

    requestAnimationFrame(() => {
      source.setData(geojson as any);
    });
  }, []);

  // ---------------- INIT MAP ----------------
  useEffect(() => {
    if (!containerRef.current) return;
    if (!MAPBOX_TOKEN) return;

    // 🔥 FIX: prevent duplicate maps (VERY IMPORTANT)
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [80.7718, 7.8731],
      zoom: 7,
    });

    mapRef.current = map;

    map.on("load", async () => {
      console.log("MAP LOADED");

      map.addSource("hexbins", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });

      map.addLayer({
        id: "hex-fill",
        type: "fill",
        source: "hexbins",
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": 0.85,
        },
      });

      setLoading(true);

      const data = await fetchData();
      rawData.current = data;

      setTimeout(() => {
        updateMap();
        map.resize(); // 🔥 FIX: ensures rendering
        setLoading(false);
      }, 300);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [fetchData, updateMap]);

  // ---------------- UPDATE ON CHANGE ----------------
  useEffect(() => {
    if (!mapRef.current) return;

    (async () => {
      setLoading(true);

      rawData.current = await fetchData();

      setTimeout(() => {
        updateMap();
        setLoading(false);
      }, 200);
    })();
  }, [operator, fetchData, updateMap]);

  // ---------------- UI ----------------
  return (
    <div style={{ position: "relative", width: "100%" }}>
      {/* 🔥 CRITICAL FIX: forced visible container */}
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "620px",
          minHeight: "620px",
          position: "relative",
          zIndex: 1,
          background: "#111",
          borderRadius: "12px",
          overflow: "hidden",
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
            zIndex: 2,
          }}
        >
          Loading Hex Grid...
        </div>
      )}
    </div>
  );
}