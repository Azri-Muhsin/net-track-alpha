import { useEffect, useMemo, useRef } from "react";
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
}

interface Props {
  geoJson: any;
  districtStats: DistrictStat[];
  points: DashboardPoint[];
  selectedDistrict: string;
  onSelectDistrict: (district: string) => void;
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
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  const districtStatsByName = useMemo(() => {
    const map = new Map<string, DistrictStat>();

    districtStats.forEach((d) => {
      map.set(cleanName(d.districtName), d);
    });

    return map;
  }, [districtStats]);

  const districtGeoJson = useMemo(() => {
    if (!geoJson?.features) {
      return {
        type: "FeatureCollection",
        features: [],
      };
    }

    return {
      ...geoJson,
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
      features: points
        .filter(
          (p) =>
            typeof p.lat === "number" &&
            typeof p.lon === "number" &&
            typeof p.rsrp_dbm === "number"
        )
        .map((p) => ({
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
        })),
    };
  }, [points]);

  useEffect(() => {
    console.log("Mapbox debug:", {
      tokenExists: Boolean(MAPBOX_TOKEN),
      hasContainer: Boolean(mapContainerRef.current),
      districts: districtGeoJson.features.length,
      points: pointGeoJson.features.length,
    });

    if (!MAPBOX_TOKEN) {
      console.error("Missing VITE_MAPBOX_TOKEN. Put it in apps/frontend/.env");
      return;
    }

    if (!mapContainerRef.current || mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [80.7718, 7.8731],
      zoom: 6.7,
      minZoom: 5.5,
      maxZoom: 14,
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
            0.85,
            0.55,
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
          "line-opacity": 0.9,
        },
      });

      map.addSource("drive-points", {
        type: "geojson",
        data: pointGeoJson as any,
      });

      map.addLayer({
        id: "drive-points-layer",
        type: "circle",
        source: "drive-points",
        paint: {
          "circle-radius": 4,
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
          "circle-opacity": 0.75,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 0.5,
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
            <div style="font-family: Inter, sans-serif;">
              <strong>${p.districtName}</strong><br/>
              Weak: ${p.weakPercent}%<br/>
              Samples: ${p.totalSamples}<br/>
              Avg RSRP: ${p.avgRsrp ?? "N/A"} dBm<br/>
              Median RSRP: ${p.medianRsrp ?? "N/A"} dBm
            </div>
          `)
          .addTo(map);
      });

      map.on("mouseleave", "district-fills", () => {
        map.getCanvas().style.cursor = "";
        popupRef.current?.remove();
      });

      map.on("click", "drive-points-layer", (e) => {
        const feature = e.features?.[0];
        if (!feature || !e.lngLat) return;

        const p = feature.properties as any;

        new mapboxgl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-family: Inter, sans-serif;">
              <strong>${p.operator ?? "Unknown operator"}</strong><br/>
              RSRP: ${p.rsrp_dbm ?? "N/A"} dBm<br/>
              SINR: ${p.sinr_db ?? "N/A"} dB<br/>
              Time: ${p.ts_utc ?? "N/A"}
            </div>
          `)
          .addTo(map);
      });

      map.resize();
    });

    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const source = map.getSource("districts") as GeoJSONSource | undefined;
    source?.setData(districtGeoJson as any);
  }, [districtGeoJson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const source = map.getSource("drive-points") as GeoJSONSource | undefined;
    source?.setData(pointGeoJson as any);
  }, [pointGeoJson]);

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