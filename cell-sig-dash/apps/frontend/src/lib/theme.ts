export type Theme = "dark" | "light" | "colorblind";

export const themes = {
  dark: {
    bg: "#000000",
    bgSecondary: "#0a0a0a",
    text: "#ffffff",
    textSecondary: "#a8a8a8",
    card: "#121212",
    cardHover: "#1a1a1a",

    accent: "#0095f6",
    accentHover: "#1877f2",
    accentGradient: "linear-gradient(135deg, #0095f6, #00d4ff)",

    success: "#00c853",
    warning: "#ff9500",
    error: "#ff3b30",

    border: "#262626",
    divider: "#1a1a1a",

    shadow: "0 2px 12px rgba(0, 0, 0, 0.5)",
    shadowHover: "0 4px 20px rgba(0, 0, 0, 0.6)",

    backdropBlur: "blur(20px)",
    glassBg: "rgba(18, 18, 18, 0.8)",
  },

  light: {
    bg: "#fafafa",
    bgSecondary: "#ffffff",
    text: "#262626",
    textSecondary: "#8e8e8e",
    card: "#ffffff",
    cardHover: "#fafafa",

    accent: "#0095f6",
    accentHover: "#1877f2",
    accentGradient: "linear-gradient(135deg, #0095f6, #00d4ff)",

    success: "#00c853",
    warning: "#ff9500",
    error: "#ff3b30",

    border: "#dbdbdb",
    divider: "#efefef",

    shadow: "0 2px 12px rgba(0, 0, 0, 0.1)",
    shadowHover: "0 4px 20px rgba(0, 0, 0, 0.15)",

    backdropBlur: "blur(20px)",
    glassBg: "rgba(255, 255, 255, 0.8)",
  },

  colorblind: {
    bg: "#ffffff",
    bgSecondary: "#f5f5f5",
    text: "#000000",
    textSecondary: "#333333",
    card: "#ffffff",
    cardHover: "#fafafa",

    accent: "#005fcc",
    accentHover: "#004099",
    accentGradient: "linear-gradient(135deg, #005fcc, #00a3cc)",

    success: "#006e3a",
    warning: "#b45f06",
    error: "#cc0000",

    border: "#999999",
    divider: "#cccccc",

    shadow: "0 2px 12px rgba(0, 0, 0, 0.2)",
    shadowHover: "0 4px 20px rgba(0, 0, 0, 0.25)",

    backdropBlur: "blur(20px)",
    glassBg: "rgba(255, 255, 255, 0.9)",
  },
};

export type ThemeColors = typeof themes.dark;