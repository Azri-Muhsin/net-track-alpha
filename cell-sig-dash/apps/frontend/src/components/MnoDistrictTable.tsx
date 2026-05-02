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

  // Helper to get sort indicator
  const getSortIndicator = (key: keyof MnoRow) => {
    if (sortKey !== key) return " ↕️";
    return desc ? " ↓" : " ↑";
  };

  // ---------------- UI ----------------
  return (
    <div className="nt-card">
      <h3 className="table-title">
        District Performance – {operator}
      </h3>

      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading table...</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="nt-table">
            <thead>
              <tr>
                <th onClick={() => handleSort("district")} className="sortable">
                  District {getSortIndicator("district")}
                </th>
                <th onClick={() => handleSort("avgRsrp")} className="sortable">
                  Avg RSRP {getSortIndicator("avgRsrp")}
                </th>
                <th onClick={() => handleSort("avgSinr")} className="sortable">
                  Avg SINR {getSortIndicator("avgSinr")}
                </th>
                <th onClick={() => handleSort("count")} className="sortable">
                  Samples {getSortIndicator("count")}
                </th>
                <th>Rating</th>
              </tr>
            </thead>

            <tbody>
              {sorted.map((row, index) => (
                <tr key={row.district} className={index % 2 === 0 ? "even-row" : "odd-row"}>
                  <td className="district-cell">{row.district}</td>

                  <td className="rsrp-cell">
                    <span
                      style={{
                        color: row.fillColor,
                        fontWeight: 600,
                      }}
                    >
                      {row.avgRsrp.toFixed(1)} dBm
                    </span>
                   </td>

                  <td className="sinr-cell">
                    {row.avgSinr.toFixed(1)} dB
                  </td>

                  <td className="count-cell">
                    {row.count.toLocaleString()}
                  </td>

                  <td className="rating-cell">
                    <span
                      className="rating-badge"
                      style={{
                        background: row.fillColor,
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
      
      <div className="table-footer">
        <span className="rows-count">Total districts: {rows.length}</span>
      </div>

      <style>{`
        /* Dark Mode Variables */
        :root {
          --bg-primary: #0a0e1a;
          --bg-secondary: #04000f;
          --bg-tertiary: #1f2937;
          --text-primary: #f3f4f6;
          --text-secondary: #9ca3af;
          --text-muted: #6b7280;
          --border-color: #374151;
          --hover-bg: #1e293b;
          --accent-blue: #3b82f6;
          --accent-green: #10b981;
          --accent-red: #ef4444;
          --accent-yellow: #f59e0b;
          --card-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2);
        }

        /* Card Container */
        .nt-card {
          background: var(--bg-secondary);
          border-radius: 12px;
          padding: 24px;
          margin-top: 20px;
          box-shadow: var(--card-shadow);
          border: 1px solid var(--border-color);
          transition: all 0.3s ease;
        }

        /* Table Title */
        .table-title {
          margin-bottom: 20px;
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--text-primary);
          letter-spacing: -0.025em;
          border-left: 4px solid var(--accent-blue);
          padding-left: 16px;
        }

        /* Table Wrapper for Overflow */
        .table-wrapper {
          overflow-x: auto;
          border-radius: 8px;
          margin-bottom: 16px;
        }

        /* Main Table Styles */
        .nt-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
          background: var(--bg-secondary);
          color: var(--text-primary);
        }

        /* Table Header */
        .nt-table thead {
          background: var(--bg-tertiary);
          border-bottom: 2px solid var(--accent-blue);
        }

        .nt-table th {
          padding: 12px 16px;
          text-align: left;
          font-weight: 600;
          font-size: 0.85rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-secondary);
          cursor: pointer;
          user-select: none;
          transition: background 0.2s ease;
          white-space: nowrap;
        }

        .nt-table th.sortable:hover {
          background: var(--hover-bg);
          color: var(--text-primary);
        }

        /* Table Body */
        .nt-table td {
          padding: 12px 16px;
          border-bottom: 1px solid var(--border-color);
          vertical-align: middle;
        }

        /* Row Hover Effect */
        .nt-table tbody tr:hover {
          background: var(--hover-bg);
          transition: background 0.2s ease;
        }

        /* Alternating Row Colors */
        .even-row {
          background: var(--bg-secondary);
        }

        .odd-row {
          background: rgba(31, 41, 55, 0.5);
        }

        /* Specific Cell Styles */
        .district-cell {
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
        }

        .district-cell::before {
          content: "📍";
          margin-right: 8px;
          opacity: 0.7;
        }

        .rsrp-cell {
          font-family: 'Courier New', monospace;
          font-weight: 600;
        }

        .sinr-cell {
          font-family: 'Courier New', monospace;
          color: var(--text-secondary);
        }

        .count-cell {
          font-family: 'Courier New', monospace;
          color: var(--text-secondary);
        }

        /* Rating Badge */
        .rating-badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 600;
          text-align: center;
          letter-spacing: 0.025em;
          color: white;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
          background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 100%);
        }

        /* Table Footer */
        .table-footer {
          margin-top: 16px;
          padding-top: 12px;
          border-top: 1px solid var(--border-color);
          display: flex;
          justify-content: flex-end;
        }

        .rows-count {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-weight: 500;
        }

        /* Loading State */
        .loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 48px 24px;
          gap: 16px;
        }

        .loading-state p {
          color: var(--text-secondary);
          margin: 0;
        }

        /* Spinner Animation */
        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid var(--border-color);
          border-top-color: var(--accent-blue);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        /* Scrollbar Styling for Dark Mode */
        .table-wrapper::-webkit-scrollbar {
          height: 8px;
          width: 8px;
        }

        .table-wrapper::-webkit-scrollbar-track {
          background: var(--bg-tertiary);
          border-radius: 4px;
        }

        .table-wrapper::-webkit-scrollbar-thumb {
          background: var(--text-muted);
          border-radius: 4px;
        }

        .table-wrapper::-webkit-scrollbar-thumb:hover {
          background: var(--text-secondary);
        }

        /* Responsive Design */
        @media (max-width: 768px) {
          .nt-card {
            padding: 16px;
          }

          .table-title {
            font-size: 1rem;
          }

          .nt-table th,
          .nt-table td {
            padding: 8px 12px;
            font-size: 0.75rem;
          }

          .rating-badge {
            padding: 2px 8px;
            font-size: 0.7rem;
          }
        }

        /* Print Styles for Formal Reports */
        @media print {
          .nt-card {
            background: white;
            box-shadow: none;
            border: 1px solid #ddd;
          }

          .nt-table th {
            background: #f3f4f6;
            color: #000;
          }

          .nt-table td {
            color: #000;
          }

          .rating-badge {
            print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  );
}