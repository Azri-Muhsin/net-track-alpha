import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { useTheme } from "../lib/ThemeContext";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN ?? "";
if (MAPBOX_TOKEN) {
  mapboxgl.accessToken = MAPBOX_TOKEN;
} else {
  console.warn("Mapbox token missing in frontend env. Falling back to open basemap.");
}

const OPERATOR_OPTIONS = ["Dialog", "Mobitel", "Hutch"];
const DEFAULT_OPERATOR = "Dialog";
const SRI_LANKA_CENTER: [number, number] = [80.7718, 7.8731];
const HEX_RADIUS = 40;
const SQRT3 = Math.sqrt(3);

function getMapStyle(theme: string) {
  if (MAPBOX_TOKEN) {
    if (theme === "dark") return "mapbox://styles/mapbox/dark-v11";
    if (theme === "light") return "mapbox://styles/mapbox/light-v11";
    return "mapbox://styles/mapbox/light-v11";
  }

  return "https://demotiles.maplibre.org/style.json";
}

function hexRound(q: number, r: number) {
  const x = q;
  const z = r;
  const y = -x - z;
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);

  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);

  if (xDiff > yDiff && xDiff > zDiff) rx = -ry - rz;
  else if (yDiff > zDiff) ry = -rx - rz;
  else rz = -rx - ry;

  return { q: rx, r: rz };
}

function pixelToHex(x: number, y: number, radius: number) {
  const q = ((2 / 3) * x) / radius;
  const r = ((-1 / 3) * x + (SQRT3 / 3) * y) / radius;
  return hexRound(q, r);
}

function hexToPixel(q: number, r: number, radius: number) {
  return [radius * ((3 / 2) * q), radius * ((SQRT3 / 2) * q + SQRT3 * r)];
}

function createHexagonPolygon(
  center: [number, number],
  radius: number,
  map: mapboxgl.Map
) {
  const coordinates: [number, number][] = [];

  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    const px = center[0] + radius * Math.cos(angle);
    const py = center[1] + radius * Math.sin(angle);
    const lngLat = map.unproject([px, py]);
    coordinates.push([lngLat.lng, lngLat.lat]);
  }

  coordinates.push(coordinates[0]);
  return coordinates;
}

function buildHexbinGeoJSON(
  features: GeoJSON.Feature<GeoJSON.Point, { rsrp?: number; sinr?: number }>[],
  map: mapboxgl.Map,
  radius = HEX_RADIUS
) {
  if (!features.length) {
    return {
      type: "FeatureCollection" as const,
      features: [] as GeoJSON.Feature<GeoJSON.Polygon, any>[],
    };
  }

  const bins = new Map<
    string,
    {
      q: number;
      r: number;
      center: [number, number];
      points: Array<{ rsrp: number; sinr: number }>;
    }
  >();

  for (const feature of features) {
    if (feature.geometry.type !== "Point") continue;

    const [lon, lat] = feature.geometry.coordinates;
    const projected = map.project(new mapboxgl.LngLat(lon, lat));
    const { q, r } = pixelToHex(projected.x, projected.y, radius);
    const key = `${q},${r}`;
    const center = hexToPixel(q, r, radius);
    const item = {
      rsrp: feature.properties?.rsrp ?? -120,
      sinr: feature.properties?.sinr ?? 0,
    };

    const existing = bins.get(key);
    if (existing) {
      existing.points.push(item);
    } else {
      bins.set(key, { q, r, center: [center[0], center[1]], points: [item] });
    }
  }

  const hexFeatures: GeoJSON.Feature<GeoJSON.Polygon, { count: number; avgRsrp: number; avgSinr: number }>[] = [];

  bins.forEach((bin) => {
    const count = bin.points.length;
    const avgRsrp = bin.points.reduce((sum, p) => sum + p.rsrp, 0) / count;
    const avgSinr = bin.points.reduce((sum, p) => sum + p.sinr, 0) / count;
    const coordinates = createHexagonPolygon(bin.center, radius, map);

    hexFeatures.push({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [coordinates],
      },
      properties: {
        count,
        avgRsrp,
        avgSinr,
      },
    });
  });

  return {
    type: "FeatureCollection" as const,
    features: hexFeatures,
  };
}

export default function HexMap() {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const rawPointsRef = useRef<GeoJSON.Feature<GeoJSON.Point, { rsrp?: number; sinr?: number }>[]>([]);
  const { theme } = useTheme();
  const [selectedOperator, setSelectedOperator] = useState(DEFAULT_OPERATOR);

  const apiBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

  async function fetchSignalData(operator: string) {
    const response = await fetch(
      `${apiBase}/api/hexbin?operator=${encodeURIComponent(operator)}&limit=15000`
    );
    if (!response.ok) {
      throw new Error(`Failed to load operator data: ${response.statusText}`);
    }

    const data = await response.json();
    return data.features as GeoJSON.Feature<GeoJSON.Point, { rsrp?: number; sinr?: number }>[];
  }

  function updateHexbinOverlay(map: mapboxgl.Map) {
    const hexSource = map.getSource("hexbins") as mapboxgl.GeoJSONSource | undefined;
    if (!hexSource) return;

    const hexData = buildHexbinGeoJSON(rawPointsRef.current, map, HEX_RADIUS);
    hexSource.setData(hexData);
  }

  useEffect(() => {
    if (!containerRef.current) return;

    containerRef.current.innerHTML = "";
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: getMapStyle(theme),
      center: SRI_LANKA_CENTER,
      zoom: 7,
    });

    mapRef.current = map;

    map.on("load", async () => {
      map.addSource("points", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });

      map.addSource("hexbins", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });

      map.addLayer({
        id: "hexbin-fill",
        type: "fill",
        source: "hexbins",
        paint: {
          "fill-color": [
            "interpolate",
            ["linear"],
            ["get", "avgRsrp"],
            -120,
            "#d73027",
            -100,
            "#fc8d59",
            -90,
            "#fee08b",
            -80,
            "#d9ef8b",
            -70,
            "#66bd63",
            -55,
            "#1a9850",
          ],
          "fill-opacity": 0.65,
        },
      });

      map.addLayer({
        id: "hexbin-outline",
        type: "line",
        source: "hexbins",
        paint: {
          "line-color": theme === "dark" ? "#ffffff" : "#222222",
          "line-width": 1,
          "line-opacity": 0.65,
        },
      });

      map.addLayer({
        id: "signal-points",
        type: "circle",
        source: "points",
        paint: {
          "circle-radius": 4,
          "circle-color": "rgba(0, 145, 246, 0.9)",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1,
          "circle-opacity": 0.75,
        },
      });

      map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");

      map.on("moveend", () => updateHexbinOverlay(map));
      map.on("zoomend", () => updateHexbinOverlay(map));

      map.on("click", "hexbin-fill", (event) => {
        if (!event.features || !event.features.length) return;
        const feature = event.features[0];
        const properties = feature.properties as {
          count: number;
          avgRsrp: number;
          avgSinr: number;
        };

        const coordinates = (feature.geometry as GeoJSON.Polygon).coordinates[0][0];
        const popupHtml = `
          <div style="font-size: 13px; line-height: 1.4;">
            <strong>${selectedOperator}</strong><br />
            points: ${properties.count}<br />
            avg RSRP: ${properties.avgRsrp.toFixed(1)} dBm<br />
            avg SINR: ${properties.avgSinr.toFixed(1)} dB
          </div>
        `;

        if (popupRef.current) popupRef.current.remove();
        popupRef.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: true })
          .setLngLat([coordinates[0], coordinates[1]])
          .setHTML(popupHtml)
          .addTo(map);
      });

      map.on("mouseenter", "hexbin-fill", () => {
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", "hexbin-fill", () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("click", "signal-points", (event) => {
        if (!event.features || !event.features.length) return;
        const properties = event.features[0].properties as { rsrp: number; sinr: number };
        const coords = (event.features[0].geometry as GeoJSON.Point).coordinates as [number, number];
        if (popupRef.current) popupRef.current.remove();
        popupRef.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: true })
          .setLngLat(coords)
          .setHTML(`
            <div style="font-size: 13px; line-height: 1.4;">
              <strong>${selectedOperator} sample</strong><br />
              RSRP: ${properties.rsrp.toFixed(1)} dBm<br />
              SINR: ${properties.sinr.toFixed(1)} dB
            </div>
          `)
          .addTo(map);
      });

      async function refreshData() {
        const points = await fetchSignalData(selectedOperator);
        rawPointsRef.current = points;

        const pointSource = map.getSource("points") as mapboxgl.GeoJSONSource;
        const hexSource = map.getSource("hexbins") as mapboxgl.GeoJSONSource;
        pointSource.setData({ type: "FeatureCollection", features: points });
        hexSource.setData(buildHexbinGeoJSON(points, map, HEX_RADIUS));
      }

      await refreshData();
    });

    return () => {
      if (popupRef.current) popupRef.current.remove();
      map.remove();
    };
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (!map.getSource("points") || !map.getSource("hexbins")) return;

    fetchSignalData(selectedOperator)
      .then((points) => {
        rawPointsRef.current = points;
        const pointSource = map.getSource("points") as mapboxgl.GeoJSONSource;
        const hexSource = map.getSource("hexbins") as mapboxgl.GeoJSONSource;
        pointSource.setData({ type: "FeatureCollection", features: points });
        hexSource.setData(buildHexbinGeoJSON(points, map, HEX_RADIUS));
      })
      .catch(console.error);
  }, [selectedOperator]);

  return (
    <div style={{ width: "100%", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <label style={{ fontSize: 14, fontWeight: 600 }}>Operator</label>
        <select
          value={selectedOperator}
          onChange={(event) => setSelectedOperator(event.target.value)}
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc" }}
        >
          {OPERATOR_OPTIONS.map((operator) => (
            <option key={operator} value={operator}>
              {operator}
            </option>
          ))}
        </select>
        {!MAPBOX_TOKEN && (
          <div style={{ color: "#d9534f", fontSize: 13, marginLeft: "auto" }}>
            No Mapbox token detected – using open MapLibre basemap.
          </div>
        )}
      </div>
      <div
        ref={containerRef}
        style={{ width: "100%", height: "550px", borderRadius: "12px", overflow: "hidden" }}
      />
    </div>
  );
}
