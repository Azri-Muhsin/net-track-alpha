import Layout from "./components/Layout";
import { ThemeProvider } from "./lib/ThemeContext";
import HexMap from "./components/HexMap";

function App() {
  return (
    <ThemeProvider>
      <Layout>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <h1 style={{ fontSize: 32, marginBottom: 16 }}>NETRACK Dashboard</h1>
          <p style={{ fontSize: 16, opacity: 0.8 }}>Sri Lanka MNO benchmark hexbin coverage map</p>

          <div style={{ marginTop: 24 }}>
            <HexMap />
          </div>
        </div>
      </Layout>
    </ThemeProvider>
  );
}

export default App;