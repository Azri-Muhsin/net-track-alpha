import Layout from "../components/Layout";
import MapBoxCoverageMap from "../components/MapBoxCoverageMap";
import { useTheme } from "../lib/ThemeContext";

export default function HomePage(props: any) {
  const { colors } = useTheme();

  const {
    currentPage,
    onNavigate,
    districtGeo,
    districtStats,
    runs,
    selectedRunId,
    setSelectedRunId,
    selectedDistrict,
    setSelectedDistrict,
    selectedOperator,
    setSelectedOperator,
    threshold,
    setThreshold,
    worstDistricts,
    avgRsrp,
    weakCoverage,
    criticalDistricts,
    goodDistricts,
    deltas,
    deltaBadge,
    provinceSummary,
    loading,
    fetchDashboardData,
    dateRange,
    setDateRange,
    apiError,
    geoError,
    getDistrictName,
  } = props;

  const cardStyle: React.CSSProperties = {
    background: colors.glassBg,
    borderColor: colors.border,
    color: colors.text,
  };

  const panelStyle: React.CSSProperties = {
    background: colors.glassBg,
    borderColor: colors.border,
    color: colors.text,
  };

  const mutedStyle: React.CSSProperties = {
    color: colors.textSecondary,
  };

  return (
    <Layout
      title="Network Drive Testing Dashboard"
      currentPage={currentPage}
      onNavigate={onNavigate}
      topbarRight={
        <>
          <select
            className="nt-pill"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            style={{
              background: colors.glassBg,
              borderColor: colors.border,
              color: colors.text,
            }}
          >
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="all">All Time</option>
          </select>

          <button
            className="nt-iconbtn"
            type="button"
            onClick={fetchDashboardData}
            style={{
              background: colors.glassBg,
              borderColor: colors.border,
              color: colors.text,
            }}
          >
            {loading ? "…" : "⟳"}
          </button>
        </>
      }
    >
      <div style={{ color: colors.text }}>
        <section
          className="nt-filters"
          style={{ borderBottomColor: colors.border }}
        >
          <div className="nt-filter">
            <label style={mutedStyle}>DISTRICT</label>
            <select
              className="nt-pill"
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
              disabled={!districtGeo}
              style={{
                background: colors.glassBg,
                borderColor: colors.border,
                color: colors.text,
              }}
            >
              <option value="all">All Districts</option>
              {(districtGeo?.features ?? [])
                .map((f: any) => getDistrictName(f))
                .sort((a: string, b: string) => a.localeCompare(b))
                .map((name: string) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
            </select>
          </div>

          <div className="nt-filter">
            <label style={mutedStyle}>MNO</label>
            <div className="nt-mno">
              {["Dialog", "Mobitel", "Hutch"].map((op) => (
                <button
                  key={op}
                  className={`mno ${op.toLowerCase()} ${
                    selectedOperator === op ? "active" : ""
                  }`}
                  onClick={() =>
                    setSelectedOperator(selectedOperator === op ? "all" : op)
                  }
                  type="button"
                  style={{
                    background:
                      selectedOperator === op ? colors.glassBg : "transparent",
                    borderColor:
                      op === "Dialog"
                        ? "#0ea5e9"
                        : op === "Mobitel"
                        ? "#22c55e"
                        : "#facc15",
                  }}
                >
                  {op}
                </button>
              ))}
            </div>
          </div>

          <div className="nt-filter grow">
            <label style={mutedStyle}>THRESHOLD</label>
            <div className="nt-threshold">
              <input
                type="range"
                min="-125"
                max="-80"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
              />

              <div className="nt-threshold-val" style={{ color: colors.text }}>
                {threshold} dBm
              </div>

              <button
                className="nt-pill"
                type="button"
                onClick={() => {
                  setSelectedDistrict("all");
                  setSelectedOperator("all");
                  setThreshold(-110);
                  setDateRange("all");
                  setSelectedRunId("");
                }}
                style={{
                  background: colors.glassBg,
                  borderColor: colors.border,
                  color: colors.text,
                }}
              >
                Reset
              </button>
            </div>
          </div>

          <div className="nt-filter">
            <label style={mutedStyle}>RUN</label>
            <select
              className="nt-pill"
              value={selectedRunId}
              onChange={(e) => setSelectedRunId(e.target.value)}
              style={{
                background: colors.glassBg,
                borderColor: colors.border,
                color: colors.text,
              }}
            >
              <option value="">All Runs</option>

              {runs?.length ? (
                runs.map((r: any) => (
                  <option key={r.run_id} value={r.run_id}>
                    {r.run_id}
                  </option>
                ))
              ) : (
                <option value="" disabled>
                  No runs found
                </option>
              )}
            </select>
          </div>
        </section>

        {apiError && <div className="error-card">API Error: {apiError}</div>}
        {geoError && <div className="error-card">Map Error: {geoError}</div>}

        <section className="kpi-grid">
          <div className="kpi-card" style={cardStyle}>
            <div className="kpi-head">
              <p style={mutedStyle}>TOTAL DISTRICTS</p>
              <span className="kpi-icon" style={panelStyle}>
                ▦
              </span>
            </div>
            <h2 style={{ color: colors.text }}>
              {districtGeo?.features?.length ?? 0}
            </h2>
            <small style={mutedStyle}>Sri Lanka coverage</small>
          </div>

          <div className="kpi-card" style={cardStyle}>
            <div className="kpi-head">
              <p style={mutedStyle}>AVG RSRP</p>
              <span className="kpi-icon" style={panelStyle}>
                ≋
              </span>
            </div>
            <h2 className="yellow">
              {avgRsrp !== null ? avgRsrp : "N/A"} dBm
            </h2>
            <small style={mutedStyle}>Selected average</small>
            <div className="kpi-foot" style={mutedStyle}>
              {deltaBadge(deltas.avgDelta, "dBm")}
              <span className="kpi-foot-label" style={mutedStyle}>
                vs previous period
              </span>
            </div>
          </div>

          <div className="kpi-card" style={cardStyle}>
            <div className="kpi-head">
              <p style={mutedStyle}>% WEAK COVERAGE</p>
              <span className="kpi-icon warn" style={panelStyle}>
                △
              </span>
            </div>
            <h2 className="orange">{weakCoverage}%</h2>
            <small style={mutedStyle}>&lt;= {threshold} dBm threshold</small>
            <div className="kpi-foot" style={mutedStyle}>
              {deltaBadge(deltas.weakDelta, "%")}
              <span className="kpi-foot-label" style={mutedStyle}>
                vs previous period
              </span>
            </div>
          </div>

          <div className="kpi-card" style={cardStyle}>
            <div className="kpi-head">
              <p style={mutedStyle}>DISTRICTS BELOW THRESHOLD</p>
              <span className="kpi-icon bad" style={panelStyle}>
                ▮
              </span>
            </div>
            <h2 className="red">{criticalDistricts}</h2>
            <small style={mutedStyle}>Require intervention</small>
            <div className="kpi-foot" style={mutedStyle}>
              {deltaBadge(deltas.criticalDelta, "")}
              <span className="kpi-foot-label" style={mutedStyle}>
                vs previous period
              </span>
            </div>
          </div>
        </section>

        <section className="map-card" style={cardStyle}>
          <div className="section-title">
            <div>
              <h2 style={{ color: colors.text }}>District Coverage Choropleth</h2>
              <p style={mutedStyle}>Aggregated RSRP weakness by district</p>
            </div>

            <div className="legend">
              <span>
                <i className="dot excellent" />
                Excellent
              </span>
              <span>
                <i className="dot good" />
                Good
              </span>
              <span>
                <i className="dot fair" />
                Fair
              </span>
              <span>
                <i className="dot poor" />
                Poor
              </span>
            </div>
          </div>

          <div className="map-layout">
            <div className="sl-map-wrapper">
              {districtGeo ? (
                <MapBoxCoverageMap
                  geoJson={districtGeo}
                  districtStats={districtStats}
                  points={[]}
                  selectedDistrict={selectedDistrict}
                  onSelectDistrict={setSelectedDistrict}
                  showRoute={false}
                  autoFitToPoints={false}
                />
              ) : (
                <p style={mutedStyle}>Loading map...</p>
              )}
            </div>

            <aside className="map-side" style={{ color: colors.text }}>
              <h3 style={mutedStyle}>WEAK % SCALE</h3>
              <p style={{ color: colors.text }}>
                <i className="dot excellent" /> &lt; 10%
              </p>
              <p style={{ color: colors.text }}>
                <i className="dot good" /> 10–25%
              </p>
              <p style={{ color: colors.text }}>
                <i className="dot fair" /> 25–45%
              </p>
              <p style={{ color: colors.text }}>
                <i className="dot poor" /> &gt; 45%
              </p>

              <h3 style={mutedStyle}>QUICK JUMP</h3>
              {worstDistricts.slice(0, 5).map((d: any) => (
                <div
                  className="quick-row"
                  key={d.districtName}
                  style={panelStyle}
                >
                  <span>{d.districtName}</span>
                  <strong className="red-text">{d.weakPercent}%</strong>
                </div>
              ))}
            </aside>
          </div>
        </section>

        <section className="ranking-card" style={cardStyle}>
          <div className="section-title">
            <h2 style={{ color: colors.text }}>Worst Districts Ranking</h2>
            <p style={mutedStyle}>By % weak RSRP</p>
          </div>

          <div
            className="rank-header"
            style={{
              color: colors.textSecondary,
              borderBottomColor: colors.border,
            }}
          >
            <span>#</span>
            <span>District</span>
            <span>% Weak</span>
            <span>Median RSRP</span>
            <span />
          </div>

          {worstDistricts.map((d: any, index: number) => (
            <div
              className="rank-row"
              key={d.districtName}
              style={{
                color: colors.text,
                borderBottomColor: colors.border,
              }}
            >
              <span>{index + 1}</span>

              <strong style={{ color: colors.text }}>
                <i className="dot poor" />
                {d.districtName}
                <small style={mutedStyle}>{d.province}</small>
              </strong>

              <div className="rank-weak">
                <em>{d.weakPercent}%</em>
                <div className="rank-bar">
                  <div
                    className="rank-bar-fill"
                    style={{ width: `${Math.min(100, d.weakPercent)}%` }}
                  />
                </div>
              </div>

              <span className="rank-median" style={mutedStyle}>
                {d.medianRsrp !== null ? d.medianRsrp : "N/A"} dBm
              </span>

              <button
                className="rank-view"
                type="button"
                onClick={() => setSelectedDistrict(d.districtName)}
              >
                View
              </button>
            </div>
          ))}

          <div className="summary-strip">
            <div style={panelStyle}>
              <strong className="green">{goodDistricts}</strong>
              <span style={mutedStyle}>Good Coverage</span>
            </div>

            <div style={panelStyle}>
              <strong className="red-text">{criticalDistricts}</strong>
              <span style={mutedStyle}>Critical Districts</span>
            </div>
          </div>
        </section>

        <section className="province-card" style={cardStyle}>
          <h2 style={{ color: colors.text }}>Province-Level Summary</h2>

          <div className="province-grid">
            {provinceSummary.map((p: any) => (
              <div
                className="province-box"
                key={p.province}
                style={panelStyle}
              >
                <span style={mutedStyle}>{p.province}</span>
                <strong>{p.weakPercent}%</strong>
                <small style={mutedStyle}>weak</small>
                <small style={mutedStyle}>{p.districts} dist.</small>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Layout>
  );
}