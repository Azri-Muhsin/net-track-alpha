import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { Theme, ThemeColors } from "./theme";
import { themes } from "./theme";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  colors: ThemeColors;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem("theme") as Theme;
    return savedTheme && (savedTheme === "dark" || savedTheme === "light" || savedTheme === "colorblind")
      ? savedTheme
      : "dark";
  });

  useEffect(() => {
    localStorage.setItem("theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const colors = themes[theme];

  return (
    <ThemeContext.Provider value={{ theme, setTheme, colors }}>
      <div
        style={{
          background: colors.bg,
          color: colors.text,
          minHeight: "100vh",
          transition: "background-color 0.3s ease, color 0.3s ease",
        }}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};