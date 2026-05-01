import * as d3 from "d3";
import { useEffect, useRef, useCallback } from "react";

export interface RigDataPoint {
    ts_utc: string;
    temp_c: number | null;
    rsrp_dbm: number | null;
    vibration_m_s2?: number | null;
}

interface Props {
    data: RigDataPoint[];
    width?: number;
    height?: number;
}

export default function VibrationRsrpChart({
    data,
    width: propWidth,
    height: propHeight = 420,
}: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);

    const draw = useCallback(() => {
        const container = containerRef.current;
        const svgEl = svgRef.current;
        if (!svgEl || !container) return;

        const width = propWidth ?? container.clientWidth;
        const margin = { top: 20, right: 70, bottom: 44, left: 60 };
        const innerW = width - margin.left - margin.right;
        const innerH = propHeight - margin.top - margin.bottom;

        // ── filter valid rows ────────────────────────────────────────────────────
        const vibRows = data
            .filter((d) => d.vibration_m_s2 != null)
            .map((d) => ({ ts: new Date(d.ts_utc), value: d.vibration_m_s2 as number }))
            .sort((a, b) => a.ts.getTime() - b.ts.getTime());

        const rsrpRows = data
            .filter((d) => d.rsrp_dbm != null)
            .map((d) => ({ ts: new Date(d.ts_utc), value: d.rsrp_dbm as number }))
            .sort((a, b) => a.ts.getTime() - b.ts.getTime());

        // ── clear previous render ────────────────────────────────────────────────
        // Preserve __zoom
        d3.select(svgEl).selectAll("*").remove();
        d3.select(svgEl)
            .attr("width", width)
            .attr("height", propHeight);

        const svg = d3
            .select(svgEl)
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        // ── scales ───────────────────────────────────────────────────────────────
        const allDates = [...vibRows, ...rsrpRows].map((d) => d.ts);
        const xScale = d3
            .scaleTime()
            .domain(d3.extent(allDates) as [Date, Date])
            .range([0, innerW])
            .nice();

        const yVib = d3
            .scaleLinear()
            .domain([0, Math.max(10, (d3.max(vibRows, (d) => d.value) ?? 10) + 2)])
            .range([innerH, 0])
            .nice();

        const yRsrp = d3
            .scaleLinear()
            .domain([-120, -30])
            .range([innerH, 0])
            .nice();

        // ── Handle persistent zoom transform ─────────────────────────────────────
        const currentTransform = d3.zoomTransform(svgEl);
        const xZoomed = currentTransform.rescaleX(xScale);

        // ── grid lines ───────────────────────────────────────────────────────────
        svg
            .append("g")
            .attr("class", "grid")
            .call(
                d3.axisLeft(yVib)
                    .ticks(6)
                    .tickSize(-innerW)
                    .tickFormat(() => "")
            )
            .call((g) => {
                g.selectAll("line").attr("stroke", "rgba(255,255,255,0.07)");
                g.select(".domain").remove();
            });

        // ── axes ─────────────────────────────────────────────────────────────────
        const xAxisGroup = svg
            .append("g")
            .attr("transform", `translate(0,${innerH})`);

        const drawXAxis = (scale: d3.ScaleTime<number, number>) => {
            xAxisGroup.call(d3.axisBottom(scale).ticks(6).tickSizeOuter(0))
                .call((g) => {
                    g.selectAll("text").attr("fill", "rgba(255,255,255,0.55)").attr("font-size", 11);
                    g.selectAll("line").attr("stroke", "rgba(255,255,255,0.2)");
                    g.select(".domain").attr("stroke", "rgba(255,255,255,0.2)");
                });
        };
        drawXAxis(xZoomed);

        svg
            .append("g")
            .call(d3.axisLeft(yVib).ticks(6).tickSizeOuter(0))
            .call((g) => {
                g.selectAll("text").attr("fill", "#a3e635").attr("font-size", 11);
                g.selectAll("line").attr("stroke", "rgba(255,255,255,0.2)");
                g.select(".domain").attr("stroke", "rgba(255,255,255,0.2)");
            })
            .append("text")
            .attr("fill", "#a3e635")
            .attr("x", -10)
            .attr("y", -14)
            .attr("text-anchor", "end")
            .attr("font-size", 11)
            .text("Vib (m/s²)");

        svg
            .append("g")
            .attr("transform", `translate(${innerW},0)`)
            .call(d3.axisRight(yRsrp).ticks(6).tickSizeOuter(0))
            .call((g) => {
                g.selectAll("text").attr("fill", "#22d3ee").attr("font-size", 11);
                g.selectAll("line").attr("stroke", "rgba(255,255,255,0.2)");
                g.select(".domain").attr("stroke", "rgba(255,255,255,0.2)");
            })
            .append("text")
            .attr("fill", "#22d3ee")
            .attr("x", 10)
            .attr("y", -14)
            .attr("text-anchor", "start")
            .attr("font-size", 11)
            .text("RSRP (dBm)");

        // ── clip path ────────────────────────────────────────────────────────────
        svg
            .append("defs")
            .append("clipPath")
            .attr("id", "vib-chart-clip")
            .append("rect")
            .attr("width", innerW)
            .attr("height", innerH);

        const chartArea = svg.append("g").attr("clip-path", "url(#vib-chart-clip)");

        // ── Vibration line ──────────────────────────────────────────────────────
        const lineGeneratorVib = d3
            .line<{ ts: Date; value: number }>()
            .x((d) => xZoomed(d.ts))
            .y((d) => yVib(d.value))
            .curve(d3.curveLinear);

        const vibPath = chartArea
            .append("path")
            .datum(vibRows)
            .attr("fill", "none")
            .attr("stroke", "#a3e635")
            .attr("stroke-width", 1.5)
            .attr("d", lineGeneratorVib);

        // ── RSRP line ────────────────────────────────────────────────────────────
        const lineGeneratorRsrp = d3
            .line<{ ts: Date; value: number }>()
            .x((d) => xZoomed(d.ts))
            .y((d) => yRsrp(d.value))
            .curve(d3.curveLinear);

        const rsrpPath = chartArea
            .append("path")
            .datum(rsrpRows)
            .attr("fill", "none")
            .attr("stroke", "#22d3ee")
            .attr("stroke-width", 1.5)
            .attr("d", lineGeneratorRsrp);

        // ── Legend ────────────────────────────────────────────────────────────────
        const legend = svg.append("g").attr("transform", `translate(0, ${innerH + 28})`);

        const legendItems = [
            { color: "#a3e635", label: "Vibration Intensity" },
            { color: "#22d3ee", label: "RSRP" },
        ];

        legendItems.forEach((item, i) => {
            const g = legend.append("g").attr("transform", `translate(${i * 140}, 0)`);
            g.append("line")
                .attr("x1", 0).attr("x2", 16)
                .attr("y1", 0).attr("y2", 0)
                .attr("stroke", item.color)
                .attr("stroke-width", 2);
            g.append("text")
                .attr("x", 22)
                .attr("y", 4)
                .attr("fill", "rgba(255,255,255,0.7)")
                .attr("font-size", 11)
                .text(item.label);
        });

        // ── Crosshair + Tooltip ───────────────────────────────────────────────────
        const bisectDate = d3.bisector((d: { ts: Date }) => d.ts).left;

        const focusLine = svg
            .append("line")
            .attr("stroke", "rgba(255,255,255,0.3)")
            .attr("stroke-width", 1)
            .attr("stroke-dasharray", "4 3")
            .attr("y1", 0)
            .attr("y2", innerH)
            .style("display", "none");

        const focusDots = chartArea.append("g").style("display", "none");
        const focusDotVib = focusDots
            .append("circle")
            .attr("r", 4)
            .attr("fill", "#a3e635")
            .attr("stroke", "#fff")
            .attr("stroke-width", 1.5);

        const focusDotRsrp = focusDots
            .append("circle")
            .attr("r", 4)
            .attr("fill", "#22d3ee")
            .attr("stroke", "#fff")
            .attr("stroke-width", 1.5);

        // Define zoom behavior
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([1, 100])
            .translateExtent([[0, 0], [innerW, innerH]])
            .extent([[0, 0], [innerW, innerH]])
            .on("zoom", (event) => {
                const t = event.transform;
                const newX = t.rescaleX(xScale);

                drawXAxis(newX);

                lineGeneratorVib.x((d) => newX(d.ts));
                lineGeneratorRsrp.x((d) => newX(d.ts));

                vibPath.attr("d", lineGeneratorVib as any);
                rsrpPath.attr("d", lineGeneratorRsrp as any);

                focusLine.style("display", "none");
                focusDots.style("display", "none");
                if (tooltipRef.current) tooltipRef.current.style.display = "none";
            });

        d3.select(svgEl).call(zoom);

        // Overlay context for pointer events
        const overlay = svg
            .append("rect")
            .attr("width", innerW)
            .attr("height", innerH)
            .attr("fill", "transparent")
            .style("cursor", "crosshair");

        overlay.on("mousemove", (event) => {
            const [mx] = d3.pointer(event);
            const currentTx = d3.zoomTransform(svgEl);
            const dynamicX = currentTx.rescaleX(xScale);
            const xDate = dynamicX.invert(mx);

            const tooltip = tooltipRef.current;
            if (!tooltip) return;

            focusLine.style("display", null).attr("x1", mx).attr("x2", mx);
            focusDots.style("display", null);

            let vLabel = "";
            if (vibRows.length) {
                const i = bisectDate(vibRows, xDate, 1);
                const d = vibRows[Math.min(i, vibRows.length - 1)];
                focusDotVib
                    .attr("cx", dynamicX(d.ts))
                    .attr("cy", yVib(d.value));
                vLabel = `📳 Vib: ${d.value.toFixed(2)} m/s²`;
            }

            let rLabel = "";
            if (rsrpRows.length) {
                const i = bisectDate(rsrpRows, xDate, 1);
                const d = rsrpRows[Math.min(i, rsrpRows.length - 1)];
                focusDotRsrp
                    .attr("cx", dynamicX(d.ts))
                    .attr("cy", yRsrp(d.value));
                rLabel = `📶 RSRP: ${d.value.toFixed(1)} dBm`;
            }

            const xDateStr = xDate.toLocaleTimeString([], {
                hour: "2-digit", minute: "2-digit", second: "2-digit",
            });

            tooltip.style.display = "block";
            let tLeft = event.offsetX + 16;
            if (tLeft + 180 > width) tLeft = event.offsetX - 196; // Avoid overflowing right edge
            tooltip.style.left = `${tLeft}px`;
            tooltip.style.top = `${Math.max(10, event.offsetY - 20)}px`;
            tooltip.innerHTML = `
      <div style="font-size:11px;opacity:0.7;margin-bottom:5px;">${xDateStr}</div>
      <div style="color:#a3e635;margin-bottom:3px;">${vLabel}</div>
      <div style="color:#22d3ee;">${rLabel}</div>
    `;
        })
            .on("mouseleave", () => {
                focusLine.style("display", "none");
                focusDots.style("display", "none");
                const tooltip = tooltipRef.current;
                if (tooltip) tooltip.style.display = "none";
            });

        overlay.on("dblclick.zoom", (event) => {
            event.stopPropagation();
            d3.select(svgEl)
                .transition()
                .duration(750)
                .call(zoom.transform, d3.zoomIdentity);
        });

    }, [data, propWidth, propHeight]);

    useEffect(() => {
        if (data.length > 0) draw();
    }, [data, draw]);

    // Re-draw on resize
    useEffect(() => {
        if (!propWidth) {
            const ro = new ResizeObserver(() => { if (data.length > 0) draw(); });
            if (containerRef.current) ro.observe(containerRef.current);
            return () => ro.disconnect();
        }
    }, [draw, data, propWidth]);

    return (
        <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
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
                    maxWidth: 180,
                    whiteSpace: "nowrap",
                    zIndex: 50,
                }}
            />
            {/* Small instructional hint for the user */}
            <div style={{ position: "absolute", top: 8, right: 12, fontSize: 10, opacity: 0.4, pointerEvents: "none" }}>
                Scroll to Zoom X-Axis • Click & Drag to Pan • Double-click to Reset
            </div>
        </div>
    );
}
