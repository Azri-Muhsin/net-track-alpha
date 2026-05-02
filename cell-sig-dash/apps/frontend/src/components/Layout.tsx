import Sidebar from "./Sidebar";
import { useTheme } from "../lib/ThemeContext";
import ChatbotPanel from "./ChatbotPanel";
import { useState } from "react";

type Page =
  | "dashboard"
  | "route-analysis"
  | "rig-health"
  | "data-table"
  | "mno-benchmark";

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
  topbarRight?: React.ReactNode;
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

export default function Layout({
  children,
  title = "Dashboard",
  topbarRight,
  currentPage,
  onNavigate,
}: LayoutProps) {
  const { colors } = useTheme();

  const [chatOpen, setChatOpen] = useState(false);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
     <Sidebar currentPage={currentPage} onNavigate={onNavigate} />
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
                onClick={() => setChatOpen((prev) => !prev)}
                style={{
                  background: chatOpen
                    ? colors.accent
                    : "transparent",
                  border: `1px solid ${colors.border}`,
                  color: chatOpen ? "#fff" : colors.text,
                  fontSize: 14,
                  cursor: "pointer",
                  padding: "8px 14px",
                  borderRadius: 10,
                  transition: "all 0.2s",
                  fontWeight: 600,
                }}
                onMouseEnter={(e) => {
                  if (!chatOpen)
                    e.currentTarget.style.background = colors.cardHover;
                }}
                onMouseLeave={(e) => {
                  if (!chatOpen)
                    e.currentTarget.style.background = "transparent";
                }}
              >
                🤖 AI Agent
              </button>

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

      <ChatbotPanel open={chatOpen} onClose={() => setChatOpen(false)} />

    </div>
  );
}