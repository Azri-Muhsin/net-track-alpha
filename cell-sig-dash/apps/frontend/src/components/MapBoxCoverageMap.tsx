import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl, { type GeoJSONSource } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

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
  avgRsrq?: number | null;
  avgSinr?: number | null;
}

interface Props {
  geoJson: any;
  districtStats: DistrictStat[];
  points: DashboardPoint[];
  selectedDistrict: string;
  onSelectDistrict: (district: string) => void;
  showRoute?: boolean;
  autoFitToPoints?: boolean;
}

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

function getDistrictName(feature: any) {
  const raw =
    feature.properties.shapeName ||
    feature.properties.NAME_2 ||
    feature.properties.district ||
    feature.properties.name ||
    "Unknown";

  return raw.replace(" District", "").trim();
}

function cleanName(name: string) {
  return name.replace(" District", "").trim().toLowerCase();
}

function getWeakColor(weakPercent: number, totalSamples: number) {
  if (!totalSamples) return "#374151";
  if (weakPercent > 45) return "#ef4444";
  if (weakPercent > 25) return "#f97316";
  if (weakPercent > 10) return "#facc15";
  return "#22c55e";
}

export default function MapBoxCoverageMap({
  geoJson,
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
  const [mapLoaded, setMapLoaded] = useState(false);

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

  const districtStatsByName = useMemo(() => {
    const map = new Map<string, DistrictStat>();
    districtStats.forEach((d) => map.set(cleanName(d.districtName), d));
    return map;
  }, [districtStats]);

  const districtGeoJson = useMemo(() => {
    if (!geoJson?.features) {
      return { type: "FeatureCollection", features: [] };
    }

    return {
      type: "FeatureCollection",
      features: geoJson.features.map((feature: any) => {
        const districtName = getDistrictName(feature);
        const stat = districtStatsByName.get(cleanName(districtName));

        return {
          ...feature,
          properties: {
            ...feature.properties,
            districtName,
            province: stat?.province ?? "Sri Lanka",
            totalSamples: stat?.totalSamples ?? 0,
            weakPercent: stat?.weakPercent ?? 0,
            avgRsrp: stat?.avgRsrp ?? null,
            medianRsrp: stat?.medianRsrp ?? null,
            avgRsrq: stat?.avgRsrq ?? null,
            avgSinr: stat?.avgSinr ?? null,
            fillColor: getWeakColor(
              stat?.weakPercent ?? 0,
              stat?.totalSamples ?? 0
            ),
            isSelected:
              selectedDistrict !== "All Districts" &&
              cleanName(selectedDistrict) === cleanName(districtName),
          },
        };
      }),
    };
  }, [geoJson, districtStatsByName, selectedDistrict]);

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
      console.error("Missing VITE_MAPBOX_TOKEN in apps/frontend/.env");
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

    map.on("load", () => {
      map.addSource("districts", {
        type: "geojson",
        data: districtGeoJson as any,
      });

      map.addLayer({
        id: "district-fills",
        type: "fill",
        source: "districts",
        paint: {
          "fill-color": ["get", "fillColor"],
          "fill-opacity": [
            "case",
            ["boolean", ["get", "isSelected"], false],
            showRoute ? 0.2 : 0.55,
            showRoute ? 0.12 : 0.55,
          ],
        },
      });

      map.addLayer({
        id: "district-borders",
        type: "line",
        source: "districts",
        paint: {
          "line-color": "#ffffff",
          "line-width": [
            "case",
            ["boolean", ["get", "isSelected"], false],
            2.5,
            0.8,
          ],
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
        const name = feature?.properties?.districtName;
        if (name) onSelectDistrict(name);
      });

      map.on("mousemove", "district-fills", (e) => {
        map.getCanvas().style.cursor = "pointer";

        const feature = e.features?.[0];
        if (!feature || !e.lngLat) return;

        const p = feature.properties as any;

        popupRef.current?.remove();

        popupRef.current = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
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
              <strong style="font-size: 14px;">${p.districtName}</strong><br/>
              <span>Avg RSRP: <strong>${p.avgRsrp ?? "N/A"} dBm</strong></span><br/>
              <span>Avg RSRQ: <strong>${p.avgRsrq ?? "N/A"} dB</strong></span><br/>
              <span>Avg SINR: <strong>${p.avgSinr ?? "N/A"} dB</strong></span><br/>
              <span>Weak: <strong>${p.weakPercent}%</strong></span><br/>
              <span>Samples: <strong>${p.totalSamples}</strong></span>
            </div>
          `)
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

        new mapboxgl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="
              font-family: Inter, sans-serif;
              color: #111827;
              min-width: 170px;
              font-size: 13px;
              line-height: 1.6;
            ">
              <strong style="font-size: 14px;">${p.districtName}</strong><br/>
              <span>Avg RSRP: <strong>${p.avgRsrp ?? "N/A"} dBm</strong></span><br/>
              <span>Avg RSRQ: <strong>${p.avgRsrq ?? "N/A"} dB</strong></span><br/>
              <span>Avg SINR: <strong>${p.avgSinr ?? "N/A"} dB</strong></span><br/>
              <span>Weak: <strong>${p.weakPercent}%</strong></span><br/>
              <span>Samples: <strong>${p.totalSamples}</strong></span>
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

    const source = map.getSource("districts") as GeoJSONSource | undefined;
    source?.setData(districtGeoJson as any);
  }, [mapLoaded, districtGeoJson]);

  useEffect(() => {
    if (!mapLoaded) return;

    const map = mapRef.current;
    if (!map) return;

    const pointsSource = map.getSource("drive-points") as GeoJSONSource | undefined;
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