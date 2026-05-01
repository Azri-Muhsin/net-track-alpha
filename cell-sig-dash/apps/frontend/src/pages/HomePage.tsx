import Layout from "../components/Layout";
import MapBoxCoverageMap from "../components/MapBoxCoverageMap";

export default function HomePage(props: any) {
  const {
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

  return (
    <Layout
      title="Network Drive Testing Dashboard"
      topbarRight={
        <>
          <select
            className="nt-pill"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
          >
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="all">All Time</option>
          </select>

          <button className="nt-iconbtn" type="button" onClick={fetchDashboardData}>
            {loading ? "…" : "⟳"}
          </button>
        </>
      }
    >
      <section className="nt-filters">
        <div className="nt-filter">
          <label>DISTRICT</label>
          <select
            className="nt-pill"
            value={selectedDistrict}
            onChange={(e) => setSelectedDistrict(e.target.value)}
            disabled={!districtGeo}
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
          <label>MNO</label>
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
              >
                {op}
              </button>
            ))}
          </div>
        </div>

        <div className="nt-filter grow">
          <label>THRESHOLD</label>
          <div className="nt-threshold">
            <input
              type="range"
              min="-125"
              max="-80"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
            />

            <div className="nt-threshold-val">{threshold} dBm</div>

            <button
              className="nt-pill"
              type="button"
              onClick={() => {
                setSelectedDistrict("all");
                setSelectedOperator("all");
                setThreshold(-110);
                setDateRange("7d");
                setSelectedRunId("");
              }}
            >
              Reset
            </button>
          </div>
        </div>

        <div className="nt-filter">
          <label>RUN</label>
          <select
            className="nt-pill"
            value={selectedRunId}
            onChange={(e) => setSelectedRunId(e.target.value)}
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
        <div className="kpi-card">
          <div className="kpi-head">
            <p>TOTAL DISTRICTS</p>
            <span className="kpi-icon">▦</span>
          </div>
          <h2>{districtGeo?.features?.length ?? 0}</h2>
          <small>Sri Lanka coverage</small>
        </div>

        <div className="kpi-card">
          <div className="kpi-head">
            <p>AVG RSRP</p>
            <span className="kpi-icon">≋</span>
          </div>
          <h2 className="yellow">
            {avgRsrp !== null ? avgRsrp : "N/A"} dBm
          </h2>
          <small>Selected average</small>
          <div className="kpi-foot">
            {deltaBadge(deltas.avgDelta, "dBm")}
            <span className="kpi-foot-label">vs previous period</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-head">
            <p>% WEAK COVERAGE</p>
            <span className="kpi-icon warn">△</span>
          </div>
          <h2 className="orange">{weakCoverage}%</h2>
          <small>&lt;= {threshold} dBm threshold</small>
          <div className="kpi-foot">
            {deltaBadge(deltas.weakDelta, "%")}
            <span className="kpi-foot-label">vs previous period</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-head">
            <p>DISTRICTS BELOW THRESHOLD</p>
            <span className="kpi-icon bad">▮</span>
          </div>
          <h2 className="red">{criticalDistricts}</h2>
          <small>Require intervention</small>
          <div className="kpi-foot">
            {deltaBadge(deltas.criticalDelta, "")}
            <span className="kpi-foot-label">vs previous period</span>
          </div>
        </div>
      </section>

      <section className="map-card">
        <div className="section-title">
          <div>
            <h2>District Coverage Choropleth</h2>
            <p>Aggregated RSRP weakness by district</p>
          </div>

          <div className="legend">
            <span><i className="dot excellent" />Excellent</span>
            <span><i className="dot good" />Good</span>
            <span><i className="dot fair" />Fair</span>
            <span><i className="dot poor" />Poor</span>
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
              <p>Loading map...</p>
            )}
          </div>

          <aside className="map-side">
            <h3>WEAK % SCALE</h3>
            <p><i className="dot excellent" /> &lt; 10%</p>
            <p><i className="dot good" /> 10–25%</p>
            <p><i className="dot fair" /> 25–45%</p>
            <p><i className="dot poor" /> &gt; 45%</p>

            <h3>QUICK JUMP</h3>
            {worstDistricts.slice(0, 5).map((d: any) => (
              <div className="quick-row" key={d.districtName}>
                <span>{d.districtName}</span>
                <strong>{d.weakPercent}%</strong>
              </div>
            ))}
          </aside>
        </div>
      </section>

      <section className="ranking-card">
        <div className="section-title">
          <h2>Worst Districts Ranking</h2>
          <p>By % weak RSRP</p>
        </div>

        <div className="rank-header">
          <span>#</span>
          <span>District</span>
          <span>% Weak</span>
          <span>Median RSRP</span>
          <span />
        </div>

        {worstDistricts.map((d: any, index: number) => (
          <div className="rank-row" key={d.districtName}>
            <span>{index + 1}</span>

            <strong>
              <i className="dot poor" />
              {d.districtName}
              <small>{d.province}</small>
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

            <span className="rank-median">
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
          <div>
            <strong className="green">{goodDistricts}</strong>
            <span>Good Coverage</span>
          </div>

          <div>
            <strong className="red-text">{criticalDistricts}</strong>
            <span>Critical Districts</span>
          </div>
        </div>
      </section>

      <section className="province-card">
        <h2>Province-Level Summary</h2>

        <div className="province-grid">
          {provinceSummary.map((p: any) => (
            <div className="province-box" key={p.province}>
              <span>{p.province}</span>
              <strong>{p.weakPercent}%</strong>
              <small>weak</small>
              <small>{p.districts} dist.</small>
            </div>
          ))}
        </div>
      </section>
    </Layout>
  );
}