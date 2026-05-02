import { useState, useEffect } from "react";
import { useTheme } from "../lib/ThemeContext";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ChatbotPanel({ open, onClose }: Props) {
  const { colors } = useTheme();

  const [mobile, setMobile] = useState(false);
  const [messages, setMessages] = useState<
    { role: "user" | "bot"; text: string }[]
  >([
    { role: "bot", text: "Hi 👋 I'm NetTrack Assistant. Ask me anything!" },
  ]);

  const [input, setInput] = useState("");

  // ---------------- MOBILE DETECT ----------------
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ---------------- SEND MESSAGE ----------------
  const sendMessage = () => {
    if (!input.trim()) return;

    const userMsg = { role: "user" as const, text: input };
    setMessages((prev) => [...prev, userMsg]);

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          text: "This is a placeholder response 🤖",
        },
      ]);
    }, 600);

    setInput("");
  };

  return (
    <>
      {/* MOBILE OVERLAY */}
      {mobile && open && (
        <div
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(4px)",
            zIndex: 998,
          }}
        />
      )}

      {/* PANEL */}
      <div
        style={{
          position: "fixed",
          right: 0,
          top: 0,
          width: 340,
          height: "100vh",
          background: colors.card,
          borderLeft: `1px solid ${colors.border}`,
          zIndex: 999,
          display: "flex",
          flexDirection: "column",
          boxShadow: colors.shadow,

          // 🔥 smooth slide animation
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.3s ease",
        }}
      >
        {/* HEADER */}
        <div
          style={{
            padding: "16px",
            borderBottom: `1px solid ${colors.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <strong>NetTrack Assistant</strong>

          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: colors.text,
              fontSize: 18,
              cursor: "pointer",
            }}
          >
            ✖
          </button>
        </div>

        {/* MESSAGES */}
        <div
          style={{
            flex: 1,
            padding: 12,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                background:
                  msg.role === "user"
                    ? colors.accent
                    : colors.cardHover,
                color: msg.role === "user" ? "#fff" : colors.text,
                padding: "8px 12px",
                borderRadius: 12,
                maxWidth: "75%",
                fontSize: 13,
              }}
            >
              {msg.text}
            </div>
          ))}
        </div>

        {/* INPUT */}
        <div
          style={{
            padding: 12,
            borderTop: `1px solid ${colors.border}`,
            display: "flex",
            gap: 8,
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask something..."
            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: 8,
              border: `1px solid ${colors.border}`,
              background: colors.cardHover,
              color: colors.text,
              outline: "none",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendMessage();
            }}
          />

          <button
            onClick={sendMessage}
            style={{
              background: colors.accent,
              border: "none",
              color: "#fff",
              padding: "8px 12px",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            ➤
          </button>
        </div>
      </div>
    </>
  );
}