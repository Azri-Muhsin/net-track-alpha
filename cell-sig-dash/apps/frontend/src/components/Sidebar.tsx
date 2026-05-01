import { useTheme } from "../lib/ThemeContext";
import { useState, useEffect } from "react";
import logo from "../assets/NetTrack_png.png";

type Page = "dashboard" | "route-analysis" | "rig-health";

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

export default function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const { theme, setTheme, colors } = useTheme();
  const [open, setOpen] = useState(true);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setMobile(window.innerWidth < 768);
      if (window.innerWidth < 768) {
        setOpen(false);
      } else {
        setOpen(true);
      }
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const menuItems: { icon: string; label: string; page: Page }[] = [
    { icon: "🏠", label: "Overview", page: "dashboard" },
    { icon: "🗺️", label: "Route Analysis", page: "route-analysis" },
    { icon: "🌡️", label: "Rig Health", page: "rig-health" },
  ];

  const disabledItems = ["MNO Benchmark", "Data Table", "Settings"];

  return (
    <>
      {/* Mobile Overlay */}
      {mobile && open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(4px)",
            zIndex: 998,
          }}
        />
      )}

      {/* Sidebar */}
      <div
        style={{
          position: mobile ? "fixed" : "relative",
          width: open ? 280 : mobile ? 0 : 80,
          height: "100vh",
          background: colors.card,
          backdropFilter: colors.backdropBlur,
          borderRight: `1px solid ${colors.border}`,
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          overflow: "hidden",
          zIndex: 999,
          display: "flex",
          flexDirection: "column",
          boxShadow: colors.shadow,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 16px",
            borderBottom: `1px solid ${colors.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          {open && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  background: colors.accentGradient,
                  borderRadius: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                }}
              >
                <img
                  src={logo}
                  alt="logo"
                  style={{ width: 50, height: 50, objectFit: "contain" }}
                />
              </div>
              <h3
                style={{
                  margin: 0,
                  fontSize: 18,
                  fontWeight: 700,
                  background: colors.accentGradient,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                NETRACK
              </h3>
            </div>
          )}
          <button
            onClick={() => setOpen(!open)}
            style={{
              background: "transparent",
              border: "none",
              color: colors.text,
              fontSize: 20,
              cursor: "pointer",
              padding: 8,
              borderRadius: 8,
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = colors.cardHover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            {open ? "◀" : "▶"}
          </button>
        </div>

        {/* Navigation Items */}
        <div style={{ flex: 1, padding: "12px 0" }}>
          {open && (
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 1.5,
                opacity: 0.45,
                padding: "4px 28px 10px",
              }}
            >
              MAIN MENU
            </div>
          )}

          {menuItems.map((item) => {
            const active = currentPage === item.page;
            return (
              <div
                key={item.page}
                onClick={() => onNavigate(item.page)}
                style={{
                  padding: "12px 16px",
                  margin: "4px 12px",
                  borderRadius: 12,
                  background: active ? colors.accent : "transparent",
                  color: active ? "#fff" : colors.text,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  cursor: "pointer",
                  transition: "all 0.2s",
                  fontWeight: active ? 600 : 400,
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = colors.cardHover;
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = "transparent";
                }}
              >
                <span style={{ fontSize: 20, minWidth: 24, textAlign: "center" }}>
                  {item.icon}
                </span>
                {open && <span>{item.label}</span>}
              </div>
            );
          })}

          {open && (
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 1.5,
                opacity: 0.45,
                padding: "16px 28px 10px",
              }}
            >
              COMING SOON
            </div>
          )}

          {disabledItems.map((label) => (
            <div
              key={label}
              style={{
                padding: "12px 16px",
                margin: "4px 12px",
                borderRadius: 12,
                color: colors.text,
                display: "flex",
                alignItems: "center",
                gap: 12,
                opacity: 0.35,
                cursor: "not-allowed",
              }}
            >
              <span style={{ fontSize: 20, minWidth: 24, textAlign: "center" }}>
                {label === "MNO Benchmark" ? "📊" : label === "Data Table" ? "📈" : "⚙️"}
              </span>
              {open && <span>{label}</span>}
            </div>
          ))}
        </div>

        {/* Theme Selector */}
        <div
          style={{
            padding: "16px",
            borderTop: `1px solid ${colors.border}`,
          }}
        >
          {open && (
            <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 600, opacity: 0.7 }}>
              APPEARANCE
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexDirection: open ? "row" : "column" }}>
            <button
              onClick={() => setTheme("dark")}
              style={{
                flex: 1,
                padding: open ? "8px 12px" : "8px",
                background: theme === "dark" ? colors.accent : colors.cardHover,
                border: `1px solid ${colors.border}`,
                borderRadius: 10,
                color: theme === "dark" ? "#fff" : colors.text,
                cursor: "pointer",
                transition: "all 0.2s",
                fontSize: open ? 14 : 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              {open ? "🌙 Dark" : "🌙"}
            </button>
            <button
              onClick={() => setTheme("light")}
              style={{
                flex: 1,
                padding: open ? "8px 12px" : "8px",
                background: theme === "light" ? colors.accent : colors.cardHover,
                border: `1px solid ${colors.border}`,
                borderRadius: 10,
                color: theme === "light" ? "#fff" : colors.text,
                cursor: "pointer",
                transition: "all 0.2s",
                fontSize: open ? 14 : 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              {open ? "☀️ Light" : "☀️"}
            </button>
            <button
              onClick={() => setTheme("colorblind")}
              style={{
                flex: 1,
                padding: open ? "8px 12px" : "8px",
                background: theme === "colorblind" ? colors.accent : colors.cardHover,
                border: `1px solid ${colors.border}`,
                borderRadius: 10,
                color: theme === "colorblind" ? "#fff" : colors.text,
                cursor: "pointer",
                transition: "all 0.2s",
                fontSize: open ? 14 : 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              {open ? "🎨 Colorblind" : "🎨"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}