import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const TOKEN = (import.meta as any).env?.VITE_MAPBOX_TOKEN ?? "";
const API = (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:8000";

const TILESET = (import.meta as any).env?.VITE_MAPBOX_DISTRICT_TILESET_URL;
const SOURCE_LAYER = (import.meta as any).env?.VITE_MAPBOX_DISTRICT_SOURCE_LAYER;
const NAME_PROP = (import.meta as any).env?.VITE_MAPBOX_DISTRICT_NAME_PROPERTY;

// ---------------- TYPES ----------------
type FeatureState = {
  avg?: number;
  count?: number;
  color?: string;
};

// ---------------- HELPERS ----------------
function clean(name: string) {
  return name?.replace(" District", "").trim().toLowerCase();
}

function getColor(r: number | null) {
  if (r == null) return "#374151";
  if (r >= -70) return "#1a9850";
  if (r >= -80) return "#66bd63";
  if (r >= -90) return "#fee08b";
  if (r >= -100) return "#fc8d59";
  if (r >= -110) return "#f46d43";
  return "#d73027";
}

// ---------------- COMPONENT ----------------
export default function DistrictHexMap({ operator = "Dialog" }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [loading, setLoading] = useState(false);

  // ---------------- FETCH ----------------
  const fetchData = useCallback(async () => {
    const res = await fetch(`${API}/api/hexbin/district?operator=${operator}`);
    const json = await res.json();
    return json.features ?? [];
  }, [operator]);

  // ---------------- INIT MAP ----------------
  useEffect(() => {
    if (!ref.current || !TOKEN) return;

    mapboxgl.accessToken = TOKEN;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = new mapboxgl.Map({
      container: ref.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [80.7718, 7.8731],
      zoom: 7,
    });

    mapRef.current = map;

    map.on("load", async () => {
      console.log("✅ MAP LOADED");

      // 🔥 VECTOR TILESET
      map.addSource("districts", {
        type: "vector",
        url: TILESET,
        promoteId: NAME_PROP, // VERY IMPORTANT
      });

      // 🔥 FILL
      map.addLayer({
        id: "district-fill",
        type: "fill",
        source: "districts",
        "source-layer": SOURCE_LAYER,
        paint: {
          "fill-color": [
            "coalesce",
            ["feature-state", "color"],
            "#374151",
          ],
          "fill-opacity": 0.8,
        },
      });

      // 🔥 BORDER
      map.addLayer({
        id: "district-border",
        type: "line",
        source: "districts",
        "source-layer": SOURCE_LAYER,
        paint: {
          "line-color": "#ffffff",
          "line-width": 1,
        },
      });

      setLoading(true);

      const data = await fetchData();

      const stats = new Map<string, { avg: number; count: number }>();

      data.forEach((f: any) => {
        stats.set(clean(f.properties.district), {
          avg: f.properties.avgRsrp,
          count: f.properties.count,
        });
      });

      // 🔥 WAIT UNTIL TILES ARE READY
      map.once("idle", () => {
        const features = map.querySourceFeatures("districts", {
          sourceLayer: SOURCE_LAYER,
        });

        console.log("Tileset features:", features.length);

        features.forEach((f) => {
          const nameRaw = f.properties?.[NAME_PROP];
          const id = f.id as string | number;

          if (!nameRaw || id == null) return;

          const name = clean(nameRaw);
          const stat = stats.get(name);

          map.setFeatureState(
            {
              source: "districts",
              sourceLayer: SOURCE_LAYER,
              id: id, // ✅ FIXED (real ID)
            },
            {
              color: getColor(stat?.avg ?? null),
              avg: stat?.avg ?? null,
              count: stat?.count ?? 0,
            } as FeatureState
          );
        });

        setLoading(false);
      });

      // ---------------- POPUP ----------------
      map.on("click", "district-fill", (e) => {
        const f = e.features?.[0];
        if (!f) return;

        const id = f.id as string | number;
        if (id == null) return;

        const state = map.getFeatureState({
          source: "districts",
          sourceLayer: SOURCE_LAYER,
          id,
        }) as FeatureState;

        const avg =
          typeof state?.avg === "number"
            ? state.avg.toFixed(1)
            : "N/A";

        new mapboxgl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(`
            <div>
              <strong>${f.properties?.[NAME_PROP]}</strong><br/>
              Avg RSRP: ${avg} dBm<br/>
              Samples: ${state?.count ?? 0}
            </div>
          `)
          .addTo(map);
      });

      map.resize();
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [fetchData]);

  return (
    <div style={{ position: "relative" }}>
      <div
        ref={ref}
        style={{
          width: "100%",
          height: "650px",
          background: "#111",
          borderRadius: "12px",
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
            color: "white",
            background: "rgba(0,0,0,0.5)",
          }}
        >
          Loading District Data...
        </div>
      )}
    </div>
  );
}