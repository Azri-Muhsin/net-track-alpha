import { useEffect, useState } from "react";

interface MnoRow {
  district: string;
  operator: string;
  avgRsrp: number;
  avgSinr: number;
  count: number;
  rating: string;
  fillColor: string;
}

const API =
  (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:8000";

interface Props {
  operator: string;
}

export default function MnoDistrictTable({ operator }: Props) {
  const [rows, setRows] = useState<MnoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState<keyof MnoRow>("avgRsrp");
  const [desc, setDesc] = useState(false);

  // ---------------- FETCH ----------------
  useEffect(() => {
    async function fetchData() {
      setLoading(true);

      try {
        const res = await fetch(
          `${API}/api/mno/district?operator=${operator}`
        );
        const data = await res.json();
        setRows(data.data || []);
      } catch (err) {
        console.error(err);
      }

      setLoading(false);
    }

    fetchData();
  }, [operator]);

  // ---------------- SORT ----------------
  const sorted = [...rows].sort((a, b) => {
    const valA = a[sortKey] ?? 0;
    const valB = b[sortKey] ?? 0;

    if (typeof valA === "number" && typeof valB === "number") {
      return desc ? valB - valA : valA - valB;
    }

    return desc
      ? String(valB).localeCompare(String(valA))
      : String(valA).localeCompare(String(valB));
  });

  function handleSort(key: keyof MnoRow) {
    if (sortKey === key) setDesc(!desc);
    else {
      setSortKey(key);
      setDesc(false);
    }
  }

  // ---------------- UI ----------------
  return (
    <div className="nt-card" style={{ marginTop: 20 }}>
      <h3 style={{ marginBottom: 12 }}>
        District Performance – {operator}
      </h3>

      {loading ? (
        <p>Loading table...</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="nt-table">
            <thead>
              <tr>
                <th onClick={() => handleSort("district")}>District</th>
                <th onClick={() => handleSort("avgRsrp")}>Avg RSRP</th>
                <th onClick={() => handleSort("avgSinr")}>Avg SINR</th>
                <th onClick={() => handleSort("count")}>Samples</th>
                <th>Rating</th>
              </tr>
            </thead>

            <tbody>
              {sorted.map((row) => (
                <tr key={row.district}>
                  <td>{row.district}</td>

                  <td
                    style={{
                      color: row.fillColor,
                      fontWeight: 600,
                    }}
                  >
                    {row.avgRsrp.toFixed(1)} dBm
                  </td>

                  <td>{row.avgSinr.toFixed(1)} dB</td>

                  <td>{row.count.toLocaleString()}</td>

                  <td>
                    <span
                      style={{
                        background: row.fillColor,
                        padding: "4px 8px",
                        borderRadius: 6,
                        color: "#fff",
                        fontSize: 12,
                      }}
                    >
                      {row.rating}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}