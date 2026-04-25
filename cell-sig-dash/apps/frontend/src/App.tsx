import { useEffect, useState, useRef } from 'react';
import * as d3 from 'd3';

interface TelemetryPoint {
  ts_utc: string;
  radio: { rsrp_dbm: number; rsrq_db: number; sinr_db: number };
  gps: { lat: number; lon: number };
  meta: { run_id: string };
}

function App() {
  const [points, setPoints] = useState<TelemetryPoint[]>([]);
  const [runId] = useState("run_test_001");
  
  // Ref for the D3 SVG container
  const svgRef = useRef<SVGSVGElement | null>(null);

  const fetchData = async () => {
    try {
      const res = await fetch(`http://localhost:8000/api/telemetry?run_id=${runId}&limit=200`);
      const data = await res.json();
      setPoints(data);
    } catch (err) {
      console.error("Failed to fetch data:", err);
    }
  };

  const seedData = async () => {
    await fetch(`http://localhost:8000/api/seed?num_points=100&run_id=${runId}`, { method: 'POST' });
    fetchData();
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- D3 Chart Rendering Logic ---
  useEffect(() => {
    if (points.length === 0 || !svgRef.current) return;

    // 1. Setup Dimensions & SVG
    const width = 900;
    const height = 400;
    const margin = { top: 40, right: 120, bottom: 50, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear previous renders

    // Format data for D3
    const data = points.map(p => ({
      date: new Date(p.ts_utc),
      rsrp: p.radio.rsrp_dbm,
      sinr: p.radio.sinr_db
    }));

    // 2. Setup Scales
    const xScale = d3.scaleTime()
      .domain(d3.extent(data, d => d.date) as [Date, Date])
      .range([0, innerWidth]);

    const yScale = d3.scaleLinear()
      .domain([
        // Pad the min/max slightly for better chart visibility
        d3.min(data, d => Math.min(d.rsrp, d.sinr))! - 5,
        d3.max(data, d => Math.max(d.rsrp, d.sinr))! + 5
      ])
      .nice()
      .range([innerHeight, 0]);

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // 3. Add Axes
    const xAxis = d3.axisBottom(xScale).tickFormat(d3.timeFormat("%H:%M:%S") as any);
    const yAxis = d3.axisLeft(yScale);

    g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(xAxis)
      .selectAll("text")
      .attr("transform", "rotate(-45)") // Rotate labels for fit
      .style("text-anchor", "end");

    g.append("g").call(yAxis);

    // 4. Line Generators
    const rsrpLine = d3.line<typeof data[0]>()
      .x(d => xScale(d.date))
      .y(d => yScale(d.rsrp))
      .curve(d3.curveMonotoneX); // Smooth curve

    const sinrLine = d3.line<typeof data[0]>()
      .x(d => xScale(d.date))
      .y(d => yScale(d.sinr))
      .curve(d3.curveMonotoneX);

    // 5. Draw Lines
    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#3b82f6") // Blue
      .attr("stroke-width", 2.5)
      .attr("d", rsrpLine);

    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#10b981") // Green
      .attr("stroke-width", 2.5)
      .attr("d", sinrLine);

    // 6. Title & Legend
    svg.append("text")
      .attr("x", width / 2)
      .attr("y", 20)
      .attr("text-anchor", "middle")
      .style("font-size", "16px")
      .style("font-weight", "bold")
      .text(`Ride ${runId} — 1 Hz Cellular Signal`);

    const legend = svg.append("g")
      .attr("transform", `translate(${width - margin.right + 20}, ${margin.top})`);

    // RSRP Legend
    legend.append("rect").attr("x", 0).attr("y", 0).attr("width", 12).attr("height", 12).attr("fill", "#3b82f6");
    legend.append("text").attr("x", 20).attr("y", 11).text("RSRP (dBm)").style("font-size", "12px");

    // SINR Legend
    legend.append("rect").attr("x", 0).attr("y", 20).attr("width", 12).attr("height", 12).attr("fill", "#10b981");
    legend.append("text").attr("x", 20).attr("y", 31).text("SINR (dB)").style("font-size", "12px");

  }, [points, runId]);

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui' }}>
      <h1>Cellular Signal Dashboard</h1>
      <button onClick={seedData} style={{ padding: '10px 20px', marginBottom: '20px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
        🔄 Generate New Dummy Ride (100 points)
      </button>

      <div style={{ marginBottom: '40px', overflowX: 'auto' }}>
        <h2>RSRP / SINR Chart (1 Hz)</h2>
        {/* D3 hooks into this SVG element */}
        <svg ref={svgRef} width="900" height="400" style={{ background: '#f8fafc', borderRadius: '8px' }}></svg>
      </div>

      <h2>Raw Data (last 10 points)</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead>
          <tr style={{ background: '#f1f5f9' }}>
            <th style={{ padding: '8px', border: '1px solid #ddd' }}>Time</th>
            <th style={{ padding: '8px', border: '1px solid #ddd' }}>RSRP</th>
            <th style={{ padding: '8px', border: '1px solid #ddd' }}>SINR</th>
            <th style={{ padding: '8px', border: '1px solid #ddd' }}>Lat / Lon</th>
          </tr>
        </thead>
        <tbody>
          {points.slice(-10).map((p, i) => (
            <tr key={i}>
              <td style={{ padding: '8px', border: '1px solid #ddd' }}>{new Date(p.ts_utc).toLocaleTimeString()}</td>
              <td style={{ padding: '8px', border: '1px solid #ddd' }}>{p.radio.rsrp_dbm} dBm</td>
              <td style={{ padding: '8px', border: '1px solid #ddd' }}>{p.radio.sinr_db} dB</td>
              <td style={{ padding: '8px', border: '1px solid #ddd' }}>{p.gps.lat.toFixed(4)}, {p.gps.lon.toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ marginTop: '30px', fontSize: '0.9rem', color: '#64748b' }}>
        Backend → MongoDB Atlas (cloud) • Data ingested at 1 Hz • Ride = run_id object
      </p>
    </div>
  );
}
export default App;