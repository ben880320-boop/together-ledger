import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";
type AppearanceMode = "system" | Theme;

const SCENE_STORAGE_KEY = "together-ledger-web-scene";
const MODE_STORAGE_KEY = "together-ledger-color-mode";
const APPEARANCE_CHANGE_EVENT = "together-ledger-appearance-change";

function resolveAppearanceTheme(defaultTheme: Theme): Theme {
  const mode = localStorage.getItem(MODE_STORAGE_KEY) as AppearanceMode | null;
  if (mode === "dark") return "dark";
  if (mode === "light") return "light";
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return defaultTheme;
}

interface ThemeContextType {
  theme: Theme;
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = false,
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    const appearanceTheme = resolveAppearanceTheme(defaultTheme);
    if (switchable) {
      const stored = localStorage.getItem("theme");
      return (stored as Theme) || appearanceTheme;
    }
    return appearanceTheme;
  });

  useEffect(() => {
    const root = document.documentElement;
    const syncStoredAppearance = () => {
      root.dataset.scene = localStorage.getItem(SCENE_STORAGE_KEY) || "rose";
      setTheme(resolveAppearanceTheme(defaultTheme));
    };
    const systemMedia = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemAppearance = () => {
      if (localStorage.getItem(MODE_STORAGE_KEY) === "system") syncStoredAppearance();
    };

    syncStoredAppearance();
    window.addEventListener(APPEARANCE_CHANGE_EVENT, syncStoredAppearance);
    window.addEventListener("storage", syncStoredAppearance);
    systemMedia.addEventListener("change", syncSystemAppearance);
    return () => {
      window.removeEventListener(APPEARANCE_CHANGE_EVENT, syncStoredAppearance);
      window.removeEventListener("storage", syncStoredAppearance);
      systemMedia.removeEventListener("change", syncSystemAppearance);
    };
  }, [defaultTheme]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    if (switchable) localStorage.setItem("theme", theme);
  }, [theme, switchable]);

  const toggleTheme = switchable
    ? () => setTheme(prev => (prev === "light" ? "dark" : "light"))
    : undefined;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, switchable }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
