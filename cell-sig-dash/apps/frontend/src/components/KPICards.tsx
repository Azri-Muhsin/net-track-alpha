import { JSX } from "react";

interface KpiCardsProps {
  totalDistricts: number;
  avgRsrp: number | null;
  weakCoverage: number;
  threshold: number;
  criticalDistricts: number;
  deltas: {
    avgDelta: number | null;
    weakDelta: number;
    criticalDelta: number;
  };
  deltaBadge: (value: number | null, suffix: string) => JSX.Element | null;
}

export default function KpiCards({
  totalDistricts,
  avgRsrp,
  weakCoverage,
  threshold,
  criticalDistricts,
  deltas,
  deltaBadge,
}: KpiCardsProps) {
  return (
    <section className="kpi-grid">
      <div className="kpi-card">
        <div className="kpi-head">
          <p>TOTAL DISTRICTS</p>
          <span className="kpi-icon">▦</span>
        </div>
        <h2>{totalDistricts}</h2>
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
  );
}