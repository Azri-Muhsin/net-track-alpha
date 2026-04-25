import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import "./index.css";

interface TelemetryPoint {
  ts_utc: string;
  radio: { rsrp_dbm: number; rsrq_db: number; sinr_db: number };
  gps: { lat: number; lon: number };
  meta: { run_id: string };
}

function App() {
  const [points, setPoints] = useState<TelemetryPoint[]>([]);
  const [runId] = useState("run_test_001");
  const svgRef = useRef<SVGSVGElement | null>(null);

  const fetchData = async () => {
    try {
      const res = await fetch(
        `http://localhost:8000/api/telemetry?run_id=${runId}&limit=200`
      );
      const data = await res.json();
      setPoints(data);
    } catch (err) {
      console.error("Failed to fetch data:", err);
    }
  };

  const seedData = async () => {
    await fetch(
      `http://localhost:8000/api/seed?num_points=100&run_id=${runId}`,
      { method: "POST" }
    );
    fetchData();
  };

  useEffect(() => {
    fetchData();
  }, []);

  const stats = useMemo(() => {
    if (!points.length) {
      return {
        avgRsrp: -106,
        weakCoverage: 37,
        samples: 52841,
      };
    }

    const avg =
      points.reduce((sum, p) => sum + p.radio.rsrp_dbm, 0) / points.length;

    const weak =
      (points.filter((p) => p.radio.rsrp_dbm < -110).length / points.length) *
      100;

    return {
      avgRsrp: Math.round(avg),
      weakCoverage: Math.round(weak),
      samples: points.length,
    };
  }, [points]);

  useEffect(() => {
    if (!svgRef.current || points.length === 0) return;

    const containerWidth = svgRef.current.parentElement?.clientWidth || 900;
    const width = containerWidth;
    const height = 350;
    const margin = { top: 30, right: 30, bottom: 45, left: 55 };

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const data = points.map((p) => ({
      date: new Date(p.ts_utc),
      rsrp: p.radio.rsrp_dbm,
      sinr: p.radio.sinr_db,
    }));

    const xScale = d3
      .scaleTime()
      .domain(d3.extent(data, (d) => d.date) as [Date, Date])
      .range([0, innerWidth]);

    const yScale = d3
      .scaleLinear()
      .domain([
        d3.min(data, (d) => Math.min(d.rsrp, d.sinr))! - 5,
        d3.max(data, (d) => Math.max(d.rsrp, d.sinr))! + 5,
      ])
      .nice()
      .range([innerHeight, 0]);

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).ticks(5).tickFormat(d3.timeFormat("%H:%M") as any));

    g.append("g").call(d3.axisLeft(yScale));

    g.selectAll(".domain, .tick line").attr("stroke", "#3a3f46");
    g.selectAll(".tick text").attr("fill", "#aeb6c2");

    const lineRsrp = d3
      .line<(typeof data)[0]>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.rsrp))
      .curve(d3.curveMonotoneX);

    const lineSinr = d3
      .line<(typeof data)[0]>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.sinr))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#0ea5e9")
      .attr("stroke-width", 2.5)
      .attr("d", lineRsrp);

    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#22c55e")
      .attr("stroke-width", 2.5)
      .attr("d", lineSinr);
  }, [points]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">◉</div>
          <div>
            <h1>NETRACK</h1>
            <p>IOT ANALYTICS</p>
          </div>
        </div>

        <nav>
          <a className="active">Overview</a>
          <a>Route Analysis</a>
          <a>MNO Benchmark</a>
          <a>Rig Health</a>
          <a>Data Table</a>
        </nav>

        <div className="live-card">
          <strong>● Live Collection</strong>
          <p>Rig ID: NTRK-04</p>
          <p>Route: CMB–KDY</p>
          <p>Samples: {stats.samples.toLocaleString()}</p>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">NETWORK DRIVE TESTING DASHBOARD</p>
          </div>
          <button className="date-btn">Last 7 Days</button>
        </header>

        <section className="filters">
          <span>DISTRICT</span>
          <button>All Districts</button>
          <span>MNO</span>
          <button className="dialog">Dialog</button>
          <button className="mobitel">Mobitel</button>
          <button className="airtel">Airtel</button>
          <button className="hutch">Hutch</button>
          <span>THRESHOLD</span>
          <input type="range" defaultValue={70} />
          <strong>-110 dBm</strong>
        </section>

        <section className="kpi-grid">
          <div className="card">
            <p>Total Districts</p>
            <h2>25</h2>
            <span className="good">▲ 0 vs last week</span>
          </div>

          <div className="card">
            <p>Avg RSRP</p>
            <h2 className="yellow">{stats.avgRsrp} dBm</h2>
            <span className="orange">▼ 2.3 dBm vs last week</span>
          </div>

          <div className="card">
            <p>% Weak Coverage</p>
            <h2 className="orange">{stats.weakCoverage}%</h2>
            <span className="orange">&lt; -110 dBm threshold</span>
          </div>

          <div className="card">
            <p>Districts Below Threshold</p>
            <h2 className="red">10</h2>
            <span className="orange">▼ 2 vs last week</span>
          </div>
        </section>

        <section className="viz-row">
          <div className="card map-card">
            <div className="section-head">
              <div>
                <h2>District Coverage Choropleth</h2>
                <p>RSRP weakness by district — click to drill down</p>
              </div>
              <button onClick={seedData}>Sync Data</button>
            </div>

            <div className="mock-map">
              {Array.from({ length: 24 }).map((_, i) => (
                <span key={i} className={`dot d${i}`} />
              ))}
            </div>
          </div>

          <div className="card ranking-card">
            <h2>Worst Districts Ranking</h2>

            {[
              ["Mullaitivu", "71%", "-121 dBm"],
              ["Kilinochchi", "67%", "-119 dBm"],
              ["Monaragala", "63%", "-118 dBm"],
              ["Mannar", "58%", "-115 dBm"],
              ["Ampara", "55%", "-114 dBm"],
              ["Hambantota", "52%", "-113 dBm"],
              ["Vavuniya", "48%", "-110 dBm"],
              ["Nuwara Eliya", "46%", "-108 dBm"],
            ].map(([name, weak, rsrp], index) => (
              <div className="rank-row" key={name}>
                <span>{index + 1}</span>
                <strong>{name}</strong>
                <em>{weak}</em>
                <small>{rsrp}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="card chart-card">
          <div className="section-head">
            <div>
              <h2>Network Signal Trend</h2>
              <p>Live RSRP and SINR readings from the active run</p>
            </div>
          </div>
          <svg ref={svgRef}></svg>
        </section>

        <section className="card province-card">
          <h2>Province-Level Summary</h2>
          <div className="province-grid">
            {[
              ["Western", "15%"],
              ["Central", "33%"],
              ["Southern", "36%"],
              ["Sabaragamuwa", "33%"],
              ["Uva", "54%"],
              ["Eastern", "44%"],
              ["North Central", "32%"],
              ["Northern", "52%"],
              ["North Western", "27%"],
            ].map(([name, value]) => (
              <div className="province" key={name}>
                <strong>{name}</strong>
                <h3>{value}</h3>
                <p>weak</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;