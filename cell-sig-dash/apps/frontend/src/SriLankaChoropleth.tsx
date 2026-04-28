import * as d3 from "d3";

interface DistrictStat {
  districtName: string;
  province: string;
  totalSamples: number;
  weakPercent: number;
  avgRsrp: number | null;
}

interface Props {
  geoJson: any;
  districtStats: DistrictStat[];
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
}: Props) {
  const width = 620;
  const height = 720;

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
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className="sl-map"
      style={{ background: "transparent" }}
    >
      {fixedGeoJson.features.map((feature: any, index: number) => {
        const districtName = getDistrictName(feature);

        const stat = districtStats.find(
          (d) => cleanName(d.districtName) === cleanName(districtName)
        );

        const path = pathGenerator(feature);
        if (!path) return null;

        return (
          <path
            key={index}
            d={path}
            fill={getFill(stat)}
            stroke="#0f172a"
            strokeWidth={0.8}
          >
            <title>
              {districtName}
              {stat
                ? ` | Weak: ${stat.weakPercent}% | Avg RSRP: ${
                    stat.avgRsrp ?? "N/A"
                  } dBm`
                : " | No samples"}
            </title>
          </path>
        );
      })}
    </svg>
  );
}