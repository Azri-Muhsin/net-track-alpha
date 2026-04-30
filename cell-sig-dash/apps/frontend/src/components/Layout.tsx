import Sidebar from "./Sidebar";
import { useTheme } from "../lib/ThemeContext";

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
  topbarRight?: React.ReactNode;
}

export default function Layout({
  children,
  title = "Dashboard",
  topbarRight,
}: LayoutProps) {
  const { colors } = useTheme();

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />

      <div style={{ flex: 1, overflow: "auto" }}>
        <div
          style={{
            position: "sticky",
            top: 0,
            background: colors.glassBg,
            backdropFilter: colors.backdropBlur,
            borderBottom: `1px solid ${colors.border}`,
            padding: "16px 24px",
            zIndex: 100,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 16,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
              {title}
            </h2>

            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              {topbarRight}

              <button
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: 20,
                  cursor: "pointer",
                  padding: 8,
                  borderRadius: "50%",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = colors.cardHover;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
                type="button"
              >
                🔔
              </button>

              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: colors.accentGradient,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                👤
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: "24px" }}>{children}</div>
      </div>
    </div>
  );
}