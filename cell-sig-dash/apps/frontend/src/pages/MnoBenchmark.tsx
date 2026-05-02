import { useState } from "react";
import Layout from "../components/Layout";
import MnoDistrictMap from "../components/MnoDistrictMap";
import MnoDistrictTable from "../components/MnoDistrictTable";
import HexMap from "../components/HexMap";
import { useTheme } from "../lib/ThemeContext";

type Page =
  | "dashboard"
  | "route-analysis"
  | "rig-health"
  | "data-table"
  | "mno-benchmark";

interface MnoBenchmarkProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  districtGeo: any;
}

export default function MnoBenchmark({
  currentPage,
  onNavigate,
  districtGeo,
}: MnoBenchmarkProps) {
  const { colors } = useTheme();
  const [mnoOperator, setMnoOperator] = useState("Dialog");

  const cardStyle: React.CSSProperties = {
    background: colors.glassBg,
    borderColor: colors.border,
    color: colors.text,
  };

  const inputStyle: React.CSSProperties = {
    background: colors.glassBg,
    borderColor: colors.border,
    color: colors.text,
  };

  const muted: React.CSSProperties = {
    color: colors.textSecondary,
  };

  return (
    <Layout
      title="MNO District Benchmark"
      currentPage={currentPage}
      onNavigate={onNavigate}
    >
      <div style={{ color: colors.text }}>
        <section className="map-card" style={cardStyle}>
          <div className="section-title">
            <div>
              <h2 style={{ color: colors.text }}>MNO District Benchmark</h2>
              <p style={muted}>
                District-level operator Dialog, Hutch, Mobitel & Airtel
              </p>
            </div>

            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <label style={{ ...muted, margin: 0, fontWeight: 600 }}>
                Operator
              </label>

              <select
                className="nt-pill"
                value={mnoOperator}
                onChange={(e) => setMnoOperator(e.target.value)}
                style={inputStyle}
              >
                <option value="Dialog">Dialog</option>
                <option value="Mobitel">Mobitel</option>
                <option value="Hutch">Hutch</option>
                <option value="Airtel">Airtel</option>
              </select>
            </div>
          </div>

          <div className="map-layout">
            <div className="sl-map-wrapper" style={cardStyle}>
              {districtGeo ? (
                <MnoDistrictMap geoJson={districtGeo} operator={mnoOperator} />
              ) : (
                <p style={muted}>Loading MNO benchmark...</p>
              )}
            </div>

            <aside className="map-side" style={cardStyle}>
              <h3 style={{ color: colors.text }}>RSRP SCALE</h3>

              <p style={muted}>
                <i className="dot excellent" /> ≥ -70 dBm
              </p>
              <p style={muted}>
                <i className="dot good" /> -80 to -71 dBm
              </p>
              <p style={muted}>
                <i className="dot fair" /> -90 to -81 dBm
              </p>
              <p style={muted}>
                <i className="dot poor" /> -100 to -91 dBm
              </p>
              <p style={muted}>
                <i className="dot weak" /> -110 to -101 dBm
              </p>
              <p style={muted}>
                <i className="dot critical" /> &lt; -110 dBm
              </p>
              <p style={muted}>
                <i className="dot nodata" /> No Data
              </p>
            </aside>
          </div>
        </section>

        <section className="map-card" style={cardStyle}>
          <MnoDistrictTable operator={mnoOperator} />
        </section>

        {/* <section className="map-card" style={cardStyle}>
          <div className="section-title">
            <div>
              <h2 style={{ color: colors.text }}>Signal Coverage (Hexbin)</h2>
              <p style={muted}>
                Fine-grained signal distribution using hexagonal binning
              </p>
            </div>
          </div>

          <HexMap />
        </section> */}

      </div>
    </Layout>
  );
}