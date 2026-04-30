import * as d3 from "d3";
import React from "react";

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
  onSelectDistrict?: (districtName: string) => void;
}

function cleanName(name: string) {
  return name.replace(" District", "").trim().toLowerCase();
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

function getFill(stat?: DistrictStat) {
  if (!stat || stat.totalSamples === 0) return "#374151";
  if (stat.weakPercent > 45) return "#ef4444";
  if (stat.weakPercent > 25) return "#f97316";
  if (stat.weakPercent > 10) return "#facc15";
  return "#22c55e";
}

function rewindFeature(feature: any) {
  const copy = structuredClone(feature);

  if (copy.geometry.type === "Polygon") {
    copy.geometry.coordinates = copy.geometry.coordinates.map((ring: any[]) =>
      [...ring].reverse()
    );
  }

  if (copy.geometry.type === "MultiPolygon") {
    copy.geometry.coordinates = copy.geometry.coordinates.map((polygon: any[]) =>
      polygon.map((ring: any[]) => [...ring].reverse())
    );
  }

  return copy;
}

export default function SriLankaChoropleth({
  geoJson,
  districtStats,
  onSelectDistrict,
}: Props) {
  const width = 620;
  const height = 720;
  const [hover, setHover] = React.useState<{
    districtName: string;
    stat: DistrictStat | null;
    x: number;
    y: number;
  } | null>(null);

  const fixedGeoJson = {
    ...geoJson,
    features: geoJson.features.map((feature: any) => rewindFeature(feature)),
  };

  const projection = d3.geoMercator().fitExtent(
    [
      [80, 30],
      [width - 80, height - 30],
    ],
    fixedGeoJson
  );

  const pathGenerator = d3.geoPath().projection(projection);

  return (
    <div className="sl-map-stage">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="sl-map"
        style={{ background: "transparent" }}
      >
        {fixedGeoJson.features.map((feature: any, index: number) => {
          const districtName = getDistrictName(feature);

          const stat =
            districtStats.find(
              (d) => cleanName(d.districtName) === cleanName(districtName)
            ) ?? null;

          const path = pathGenerator(feature);
          if (!path) return null;

          return (
            <path
              key={index}
              d={path}
              fill={getFill(stat ?? undefined)}
              stroke="#0f172a"
              strokeWidth={0.8}
              onMouseMove={(e) => {
                const svg = (e.currentTarget.ownerSVGElement ??
                  e.currentTarget.closest("svg")) as SVGSVGElement | null;
                const rect = svg?.getBoundingClientRect();
                const x = rect ? e.clientX - rect.left : e.clientX;
                const y = rect ? e.clientY - rect.top : e.clientY;
                setHover({ districtName, stat, x, y });
              }}
              onMouseLeave={() => setHover(null)}
              onClick={() => {
                if (onSelectDistrict) onSelectDistrict(districtName);
              }}
            />
          );
        })}
      </svg>

      {hover?.stat && hover.stat.totalSamples > 0 && (
        <div
          className="sl-tooltip"
          style={{
            left: Math.min(520, Math.max(20, hover.x + 14)),
            top: Math.min(640, Math.max(20, hover.y + 12)),
          }}
        >
          <div className="sl-tooltip-title">{hover.districtName}</div>
          <div className="sl-tooltip-row">
            <span>Weak Coverage:</span>
            <strong>{hover.stat.weakPercent}%</strong>
          </div>
          <div className="sl-tooltip-row">
            <span>Median RSRP:</span>
            <strong>{hover.stat.medianRsrp ?? "N/A"} dBm</strong>
          </div>
          <div className="sl-tooltip-row">
            <span>Samples:</span>
            <strong>{hover.stat.totalSamples.toLocaleString()}</strong>
          </div>

          <div className="sl-tooltip-foot">
            <button
              type="button"
              className="sl-tooltip-link"
              onClick={() => onSelectDistrict?.(hover.districtName)}
            >
              drill down →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}