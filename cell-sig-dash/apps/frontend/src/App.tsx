import { useEffect } from "react";
import Layout from "./components/Layout";
import { ThemeProvider } from "./lib/ThemeContext";

function App() {
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("http://localhost:8000/api/telemetry?run_id=run_test_001&limit=10");
        const data = await res.json();
        console.log("Telemetry:", data);
      } catch (err) {
        console.error("Fetch error:", err);
      }
    };

    fetchData();
  }, []);

  return (
    <ThemeProvider>
      <Layout>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <h1 style={{ fontSize: 32, marginBottom: 16 }}>NETRACK Dashboard</h1>
          <p style={{ fontSize: 16, opacity: 0.8 }}>Welcome to MNO Benchmark System</p>
          
          {/* Example Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, marginTop: 32 }}>
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                style={{
                  background: "var(--card)",
                  borderRadius: 16,
                  padding: 20,
                  boxShadow: "var(--shadow)",
                  transition: "transform 0.2s",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-4px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <h3>Card {i}</h3>
                <p style={{ opacity: 0.7 }}>Sample card content for the dashboard</p>
              </div>
            ))}
          </div>
        </div>
      </Layout>
    </ThemeProvider>
  );
}

export default App;