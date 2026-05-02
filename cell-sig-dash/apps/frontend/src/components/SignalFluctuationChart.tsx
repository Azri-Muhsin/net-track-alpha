// components/SignalFluctuationChart.tsx
import * as d3 from "d3";
import { useEffect, useRef, useCallback, useState } from "react";

export interface SignalPoint {
  ts_utc?: string;
  seq?: number;
  rsrp_dbm?: number | null;
  rsrq_db?: number | null;
  sinr_db?: number | null;
  radio?: {
    rsrp_dbm?: number | null;
    rsrq_db?: number | null;
    sinr_db?: number | null;
  };
}

interface Props {
  data: SignalPoint[];
  width?: number;
  height?: number;
}

type MetricKey = "rsrp" | "rsrq" | "sinr";

const METRICS: Record<
  MetricKey,
  { label: string; unit: string; color: string; domain: [number, number] }
> = {
  rsrp: {
    label: "RSRP",
    unit: "dBm",
    color: "#22d3ee",
    domain: [-130, -60],
  },
  rsrq: {
    label: "RSRQ",
    unit: "dB",
    color: "#f97316",
    domain: [-25, 0],
  },
  sinr: {
    label: "SINR",
    unit: "dB",
    color: "#a78bfa",
    domain: [-10, 40],
  },
};

export default function SignalFluctuationChart({
  data,
  width: propWidth,
  height = 420,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const [selectedMetric, setSelectedMetric] = useState<MetricKey>("rsrp");

  const draw = useCallback(() => {
    const container = containerRef.current;
    const svgEl = svgRef.current;
    if (!container || !svgEl) return;

    const metric = METRICS[selectedMetric];

    const width = propWidth ?? container.clientWidth;
    const margin = { top: 24, right: 40, bottom: 48, left: 64 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const rows = data
      .map((d, index) => {
        const ts = d.ts_utc ? new Date(d.ts_utc) : null;

        return {
          x: ts && !Number.isNaN(ts.getTime()) ? ts : new Date(index * 1000),
          index,
          rsrp: d.radio?.rsrp_dbm ?? d.rsrp_dbm ?? null,
          rsrq: d.radio?.rsrq_db ?? d.rsrq_db ?? null,
          sinr: d.radio?.sinr_db ?? d.sinr_db ?? null,
        };
      })
      .sort((a, b) => a.x.getTime() - b.x.getTime());

    d3.select(svgEl).selectAll("*").remove();
    d3.select(svgEl).attr("width", width).attr("height", height);

    if (!rows.length) return;

    const values = rows
      .map((d) => d[selectedMetric])
      .filter((v): v is number => typeof v === "number");

    if (!values.length) return;

    const valueExtent = d3.extent(values) as [number, number];
    const spread = Math.max(1, valueExtent[1] - valueExtent[0]);
    const padding = spread * 0.15;

    const yMin = Math.min(metric.domain[0], valueExtent[0] - padding);
    const yMax = Math.max(metric.domain[1], valueExtent[1] + padding);

    const svg = d3
      .select(svgEl)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const xScale = d3
      .scaleTime()
      .domain(d3.extent(rows, (d) => d.x) as [Date, Date])
      .range([0, innerW])
      .nice();

    const yScale = d3
      .scaleLinear()
      .domain([yMin, yMax])
      .range([innerH, 0])
      .nice();

    const currentTransform = d3.zoomTransform(svgEl);
    const xZoomed = currentTransform.rescaleX(xScale);

    svg
      .append("g")
      .call(
        d3
          .axisLeft(yScale)
          .ticks(6)
          .tickSize(-innerW)
          .tickFormat(() => "")
      )
      .call((g) => {
        g.selectAll("line").attr("stroke", "rgba(255,255,255,0.07)");
        g.select(".domain").remove();
      });

    const xAxisGroup = svg
      .append("g")
      .attr("transform", `translate(0,${innerH})`);

    const drawXAxis = (scale: d3.ScaleTime<number, number>) => {
      xAxisGroup
        .call(d3.axisBottom(scale).ticks(6).tickSizeOuter(0))
        .call((g) => {
          g.selectAll("text")
            .attr("fill", "rgba(255,255,255,0.55)")
            .attr("font-size", 11);
          g.selectAll("line").attr("stroke", "rgba(255,255,255,0.2)");
          g.select(".domain").attr("stroke", "rgba(255,255,255,0.2)");
        });
    };

    drawXAxis(xZoomed);

    svg
      .append("g")
      .call(d3.axisLeft(yScale).ticks(6).tickSizeOuter(0))
      .call((g) => {
        g.selectAll("text").attr("fill", metric.color).attr("font-size", 11);
        g.selectAll("line").attr("stroke", "rgba(255,255,255,0.2)");
        g.select(".domain").attr("stroke", "rgba(255,255,255,0.2)");
      })
      .append("text")
      .attr("fill", metric.color)
      .attr("x", -10)
      .attr("y", -14)
      .attr("text-anchor", "end")
      .attr("font-size", 11)
      .text(`${metric.label} (${metric.unit})`);

    svg
      .append("defs")
      .append("clipPath")
      .attr("id", "signal-chart-clip")
      .append("rect")
      .attr("width", innerW)
      .attr("height", innerH);

    const chartArea = svg.append("g").attr("clip-path", "url(#signal-chart-clip)");

    const lineGenerator = d3
      .line<any>()
      .defined((d) => d[selectedMetric] !== null && d[selectedMetric] !== undefined)
      .x((d) => xZoomed(d.x))
      .y((d) => yScale(d[selectedMetric]))
      .curve(d3.curveLinear);

    const signalPath = chartArea
      .append("path")
      .datum(rows)
      .attr("fill", "none")
      .attr("stroke", metric.color)
      .attr("stroke-width", 1.9)
      .attr("d", lineGenerator);

    const legend = svg.append("g").attr("transform", `translate(0, ${innerH + 30})`);

    legend
      .append("line")
      .attr("x1", 0)
      .attr("x2", 16)
      .attr("y1", 0)
      .attr("y2", 0)
      .attr("stroke", metric.color)
      .attr("stroke-width", 2);

    legend
      .append("text")
      .attr("x", 22)
      .attr("y", 4)
      .attr("fill", "rgba(255,255,255,0.7)")
      .attr("font-size", 11)
      .text(`${metric.label} ${metric.unit}`);

    const bisectDate = d3.bisector((d: any) => d.x).left;

    const focusLine = svg
      .append("line")
      .attr("stroke", "rgba(255,255,255,0.3)")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "4 3")
      .attr("y1", 0)
      .attr("y2", innerH)
      .style("display", "none");

    const focusDot = chartArea
      .append("circle")
      .attr("r", 4)
      .attr("fill", metric.color)
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .style("display", "none");

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 80])
      .translateExtent([
        [0, 0],
        [innerW, innerH],
      ])
      .extent([
        [0, 0],
        [innerW, innerH],
      ])
      .on("zoom", (event) => {
        const newX = event.transform.rescaleX(xScale);

        drawXAxis(newX);

        lineGenerator.x((d) => newX(d.x));
        signalPath.attr("d", lineGenerator as any);

        focusLine.style("display", "none");
        focusDot.style("display", "none");
        if (tooltipRef.current) tooltipRef.current.style.display = "none";
      });

    d3.select(svgEl).call(zoom);

    const overlay = svg
      .append("rect")
      .attr("width", innerW)
      .attr("height", innerH)
      .attr("fill", "transparent")
      .style("cursor", "crosshair");

    overlay
      .on("mousemove", (event) => {
        const [mx] = d3.pointer(event);
        const dynamicX = d3.zoomTransform(svgEl).rescaleX(xScale);
        const xDate = dynamicX.invert(mx);

        const i = bisectDate(rows, xDate, 1);
        const d = rows[Math.min(i, rows.length - 1)];
        const tooltip = tooltipRef.current;
        if (!tooltip || !d) return;

        const value = d[selectedMetric];

        focusLine.style("display", null).attr("x1", mx).attr("x2", mx);

        if (typeof value === "number") {
          focusDot
            .style("display", null)
            .attr("cx", dynamicX(d.x))
            .attr("cy", yScale(value));
        } else {
          focusDot.style("display", "none");
        }

        tooltip.style.display = "block";

        let left = event.offsetX + 16;
        if (left + 200 > width) left = event.offsetX - 216;

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${Math.max(10, event.offsetY - 20)}px`;

        tooltip.innerHTML = `
          <div style="font-size:11px;opacity:0.7;margin-bottom:5px;">
            ${d.x.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </div>
          <div style="color:${metric.color};">
            ${metric.label}: ${value ?? "N/A"} ${metric.unit}
          </div>
        `;
      })
      .on("mouseleave", () => {
        focusLine.style("display", "none");
        focusDot.style("display", "none");
        if (tooltipRef.current) tooltipRef.current.style.display = "none";
      });

    overlay.on("dblclick.zoom", (event) => {
      event.stopPropagation();
      d3.select(svgEl)
        .transition()
        .duration(600)
        .call(zoom.transform, d3.zoomIdentity);
    });
  }, [data, propWidth, height, selectedMetric]);

  useEffect(() => {
    if (data.length > 0) draw();
  }, [data, draw]);

  useEffect(() => {
    if (!propWidth) {
      const ro = new ResizeObserver(() => {
        if (data.length > 0) draw();
      });

      if (containerRef.current) ro.observe(containerRef.current);

      return () => ro.disconnect();
    }
  }, [draw, data, propWidth]);

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {(["rsrp", "rsrq", "sinr"] as MetricKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setSelectedMetric(key)}
            className="nt-pill"
            style={{
              border:
                selectedMetric === key
                  ? `1px solid ${METRICS[key].color}`
                  : "1px solid rgba(255,255,255,0.12)",
              color: selectedMetric === key ? METRICS[key].color : undefined,
            }}
          >
            {METRICS[key].label}
          </button>
        ))}
      </div>

      <svg ref={svgRef} style={{ width: "100%", display: "block" }} />

      <div
        ref={tooltipRef}
        style={{
          display: "none",
          position: "absolute",
          pointerEvents: "none",
          background: "rgba(10,15,30,0.92)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 8,
          padding: "8px 12px",
          fontSize: 12,
          color: "#fff",
          backdropFilter: "blur(8px)",
          lineHeight: 1.6,
          maxWidth: 200,
          whiteSpace: "nowrap",
          zIndex: 50,
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 48,
          right: 12,
          fontSize: 10,
          opacity: 0.4,
          pointerEvents: "none",
        }}
      >
        Scroll to Zoom X-Axis • Drag to Pan • Double-click to Reset
      </div>
    </div>
  );
}