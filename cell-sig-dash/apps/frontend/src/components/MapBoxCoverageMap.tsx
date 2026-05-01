import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl, { type GeoJSONSource } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

interface DashboardPoint {
  id: string;
  ts_utc: string;
  operator: string;
  rsrp_dbm: number | null;
  rsrq_db?: number | null;
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
  avgRsrq?: number | null;
  avgSinr?: number | null;
}

interface Props {
  geoJson?: any;
  districtStats: DistrictStat[];
  points: DashboardPoint[];
  selectedDistrict: string;
  onSelectDistrict: (district: string) => void;
  showRoute?: boolean;
  autoFitToPoints?: boolean;
}

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

const DISTRICT_TILESET_URL = import.meta.env
  .VITE_MAPBOX_DISTRICT_TILESET_URL as string | undefined;

const DISTRICT_SOURCE_LAYER =
  (import.meta.env.VITE_MAPBOX_DISTRICT_SOURCE_LAYER as string | undefined) ||
  "polygon";

const DISTRICT_NAME_PROPERTY =
  (import.meta.env.VITE_MAPBOX_DISTRICT_NAME_PROPERTY as string | undefined) ||
  "shapeName";

function cleanName(name: string) {
  return String(name || "")
    .replace(/district/gi, "")
    .trim()
    .toLowerCase();
}

function titleCaseDistrict(name: string) {
  return cleanName(name)
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getDistrictColor(d: DistrictStat) {
  if (!d || d.totalSamples === 0) return "#374151";
  if (d.weakPercent > 45) return "#ef4444";
  if (d.weakPercent > 25) return "#f97316";
  if (d.weakPercent > 10) return "#facc15";
  return "#22c55e";
}

function getDistrictNameFromFeature(feature: any) {
  const p = feature?.properties ?? {};

  const raw =
    p[DISTRICT_NAME_PROPERTY] ||
    p.shapeName ||
    p.districtName ||
    p.NAME_2 ||
    p.district ||
    p.name ||
    "Unknown";

  return String(raw).replace(/district/gi, "").trim();
}

function getDistrictFillColorExpression(districtStats: DistrictStat[]) {
  if (!districtStats || districtStats.length === 0) {
    return "#374151";
  }

  const expression: any[] = ["match", ["get", DISTRICT_NAME_PROPERTY]];

  const used = new Set<string>();

  districtStats.forEach((d) => {
    const color = getDistrictColor(d);

    // FORCE exact match to GeoJSON
    const key = `${d.districtName.trim()} District`;

    if (!used.has(key)) {
      expression.push(key);
      expression.push(color);
      used.add(key);
    }
  });

  expression.push("#374151");

  return expression;
}

export default function MapBoxCoverageMap({
  districtStats,
  points,
  selectedDistrict,
  onSelectDistrict,
  showRoute = false,
  autoFitToPoints = false,
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  const districtStatsByNameRef = useRef<Map<string, DistrictStat>>(new Map());

  const [mapLoaded, setMapLoaded] = useState(false);

  const districtStatsByName = useMemo(() => {
    const map = new Map<string, DistrictStat>();

    districtStats.forEach((d) => {
      map.set(cleanName(d.districtName), d);
    });

    return map;
  }, [districtStats]);

  useEffect(() => {
  districtStatsByNameRef.current = districtStatsByName;
}, [districtStatsByName]);

  const validPoints = useMemo(() => {
    return points
      .filter(
        (p) =>
          typeof p.lat === "number" &&
          typeof p.lon === "number" &&
          typeof p.rsrp_dbm === "number" &&
          !Number.isNaN(p.lat) &&
          !Number.isNaN(p.lon)
      )
      .sort(
        (a, b) => new Date(a.ts_utc).getTime() - new Date(b.ts_utc).getTime()
      );
  }, [points]);

  const pointGeoJson = useMemo(() => {
    return {
      type: "FeatureCollection",
      features: showRoute
        ? validPoints.map((p) => ({
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [p.lon, p.lat],
            },
            properties: {
              id: p.id,
              operator: p.operator,
              rsrp_dbm: p.rsrp_dbm,
              rsrq_db: p.rsrq_db ?? null,
              sinr_db: p.sinr_db,
              ts_utc: p.ts_utc,
            },
          }))
        : [],
    };
  }, [validPoints, showRoute]);

  const routeLineGeoJson = useMemo(() => {
    const coordinates = showRoute ? validPoints.map((p) => [p.lon, p.lat]) : [];

    return {
      type: "FeatureCollection",
      features:
        coordinates.length >= 2
          ? [
              {
                type: "Feature",
                geometry: {
                  type: "LineString",
                  coordinates,
                },
                properties: {},
              },
            ]
          : [],
    };
  }, [validPoints, showRoute]);

  const fitToRoute = () => {
    const map = mapRef.current;
    if (!map || validPoints.length === 0) return;

    if (validPoints.length === 1) {
      map.easeTo({
        center: [validPoints[0].lon as number, validPoints[0].lat as number],
        zoom: 14,
        duration: 800,
      });
      return;
    }

    const bounds = new mapboxgl.LngLatBounds();

    validPoints.forEach((p) => {
      bounds.extend([p.lon as number, p.lat as number]);
    });

    map.fitBounds(bounds, {
      padding: 90,
      maxZoom: 14,
      duration: 900,
    });
  };

  useEffect(() => {
    if (!MAPBOX_TOKEN) {
      console.error("Missing VITE_MAPBOX_TOKEN in .env");
      return;
    }

    if (!DISTRICT_TILESET_URL) {
      console.error("Missing VITE_MAPBOX_DISTRICT_TILESET_URL in .env");
      return;
    }

    if (!mapContainerRef.current || mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [80.7718, 7.8731],
      zoom: 6.7,
      minZoom: 5,
      maxZoom: 16,
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.on("error", (e: any) => {
      console.error("Mapbox error event:", e);
      console.error("Mapbox error message:", e?.error?.message);
      console.error("Mapbox error stack:", e?.error?.stack);
    });

    map.on("load", () => {
      map.addSource("districts", {
        type: "vector",
        url: DISTRICT_TILESET_URL,
      });

      map.addLayer({
        id: "district-fills",
        type: "fill",
        source: "districts",
        "source-layer": DISTRICT_SOURCE_LAYER,
        paint: {
          "fill-color": getDistrictFillColorExpression(districtStats) as any,
          "fill-opacity": showRoute ? 0.15 : 0.65,
        },
      });

      map.addLayer({
        id: "district-borders",
        type: "line",
        source: "districts",
        "source-layer": DISTRICT_SOURCE_LAYER,
        paint: {
          "line-color": "#ffffff",
          "line-width": 0.8,
          "line-opacity": showRoute ? 0.45 : 0.9,
        },
      });

      map.addSource("route-line", {
        type: "geojson",
        data: routeLineGeoJson as any,
      });

      map.addLayer({
        id: "route-line-layer",
        type: "line",
        source: "route-line",
        layout: {
          "line-cap": "round",
          "line-join": "round",
          visibility: showRoute ? "visible" : "none",
        },
        paint: {
          "line-color": "#38bdf8",
          "line-width": 5,
          "line-opacity": 0.9,
        },
      });

      map.addSource("drive-points", {
        type: "geojson",
        data: pointGeoJson as any,
        cluster: false,
      });

      map.addLayer({
        id: "drive-points-layer",
        type: "circle",
        source: "drive-points",
        layout: {
          visibility: showRoute ? "visible" : "none",
        },
        paint: {
          "circle-radius": 6,
          "circle-color": [
            "case",
            ["<=", ["get", "rsrp_dbm"], -110],
            "#ef4444",
            ["<=", ["get", "rsrp_dbm"], -100],
            "#f97316",
            ["<=", ["get", "rsrp_dbm"], -90],
            "#facc15",
            "#22c55e",
          ],
          "circle-opacity": 0.95,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1,
        },
      });

      map.on("click", "district-fills", (e) => {
        const feature = e.features?.[0];
        if (!feature) return;

        console.log("Clicked district properties:", feature.properties);

        const districtName = getDistrictNameFromFeature(feature);

        if (districtName && districtName !== "Unknown") {
          onSelectDistrict(districtName);
        }
      });

      map.on("mousemove", "district-fills", (e) => {
        map.getCanvas().style.cursor = "pointer";

        const feature = e.features?.[0];
        if (!feature || !e.lngLat) return;

        const districtName = getDistrictNameFromFeature(feature);
        const stat = districtStatsByNameRef.current.get(cleanName(districtName));

        popupRef.current?.remove();

        popupRef.current = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 12,
        })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="
              font-family: Inter, sans-serif;
              color: #111827;
              min-width: 180px;
              font-size: 13px;
              line-height: 1.6;
            ">
              <strong style="font-size: 14px;">${districtName}</strong><br/>
              <span>Avg RSRP: <strong>${stat?.avgRsrp ?? "N/A"} dBm</strong></span><br/>
              <span>Avg RSRQ: <strong>${stat?.avgRsrq ?? "N/A"} dB</strong></span><br/>
              <span>Avg SINR: <strong>${stat?.avgSinr ?? "N/A"} dB</strong></span><br/>
              <span>Weak: <strong>${stat?.weakPercent ?? 0}%</strong></span><br/>
              <span>Samples: <strong>${stat?.totalSamples ?? 0}</strong></span>
            </div>
          `)
          .addTo(map);
      });

      map.on("mouseleave", "district-fills", () => {
        map.getCanvas().style.cursor = "";
        popupRef.current?.remove();
      });

      map.on("click", "drive-points-layer", (e) => {
        if (!showRoute) return;

        const feature = e.features?.[0];
        if (!feature || !e.lngLat) return;

        const p = feature.properties as any;

        new mapboxgl.Popup({
          offset: 12,
        })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="
              font-family: Inter, sans-serif;
              color: #111827;
              min-width: 170px;
              font-size: 13px;
              line-height: 1.6;
            ">
              <strong style="font-size: 14px;">${p.operator ?? "Unknown operator"}</strong><br/>
              <span>RSRP: <strong>${p.rsrp_dbm ?? "N/A"} dBm</strong></span><br/>
              <span>RSRQ: <strong>${p.rsrq_db ?? "N/A"} dB</strong></span><br/>
              <span>SINR: <strong>${p.sinr_db ?? "N/A"} dB</strong></span><br/>
              <span>Time: <strong>${p.ts_utc ?? "N/A"}</strong></span>
            </div>
          `)
          .addTo(map);
      });

      map.resize();
      setMapLoaded(true);
    });

    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, []);

  useEffect(() => {
    if (!mapLoaded) return;

    const map = mapRef.current;
    if (!map) return;

    if (map.getLayer("district-fills")) {
      map.setPaintProperty(
        "district-fills",
        "fill-color",
        getDistrictFillColorExpression(districtStats) as any
      );

      map.setPaintProperty(
        "district-fills",
        "fill-opacity",
        showRoute ? 0.15 : 0.65
      );
    }

    if (map.getLayer("district-borders")) {
      map.setPaintProperty(
        "district-borders",
        "line-opacity",
        showRoute ? 0.45 : 0.9
      );
    }
  }, [mapLoaded, districtStats, showRoute]);

  useEffect(() => {
    if (!mapLoaded) return;

    const map = mapRef.current;
    if (!map) return;

    const pointsSource = map.getSource("drive-points") as
      | GeoJSONSource
      | undefined;
    pointsSource?.setData(pointGeoJson as any);

    const routeSource = map.getSource("route-line") as GeoJSONSource | undefined;
    routeSource?.setData(routeLineGeoJson as any);

    if (map.getLayer("drive-points-layer")) {
      map.setLayoutProperty(
        "drive-points-layer",
        "visibility",
        showRoute ? "visible" : "none"
      );
    }

    if (map.getLayer("route-line-layer")) {
      map.setLayoutProperty(
        "route-line-layer",
        "visibility",
        showRoute ? "visible" : "none"
      );
    }

    if (showRoute && autoFitToPoints && validPoints.length > 0) {
      setTimeout(fitToRoute, 250);
    }
  }, [
    mapLoaded,
    pointGeoJson,
    routeLineGeoJson,
    showRoute,
    autoFitToPoints,
    validPoints,
  ]);

  return (
    <div
      ref={mapContainerRef}
      style={{
        width: "100%",
        height: "620px",
        minHeight: "620px",
        borderRadius: "24px",
        overflow: "hidden",
        background: "#111827",
      }}
    />
  );
}