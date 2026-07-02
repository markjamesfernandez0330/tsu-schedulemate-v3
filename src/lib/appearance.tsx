import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type AccentKey = "maroon" | "blue" | "emerald" | "violet" | "zinc" | "amber";

export const ACCENTS: { key: AccentKey; label: string; swatch: string }[] = [
  { key: "maroon", label: "TSU Maroon", swatch: "#7f1d1d" },
  { key: "blue", label: "Default Blue", swatch: "#3b82f6" },
  { key: "emerald", label: "Emerald Green", swatch: "#059669" },
  { key: "violet", label: "Violet Royal", swatch: "#8b5cf6" },
  { key: "zinc", label: "Zinc Charcoal", swatch: "#3f3f46" },
  { key: "amber", label: "Amber Orange", swatch: "#f59e0b" },
];

interface Ctx {
  mode: ThemeMode;
  accent: AccentKey;
  setMode: (m: ThemeMode) => void;
  setAccent: (a: AccentKey) => void;
}
const AppearanceCtx = createContext<Ctx | null>(null);

const KEY_MODE = "tsu.appearance.mode";
const KEY_ACCENT = "tsu.appearance.accent";

function applyMode(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const isDark =
    mode === "dark" ||
    (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", isDark);
}
function applyAccent(accent: AccentKey) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-accent", accent);
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("light");
  const [accent, setAccentState] = useState<AccentKey>("maroon");

  useEffect(() => {
    const m = (localStorage.getItem(KEY_MODE) as ThemeMode) || "light";
    const a = (localStorage.getItem(KEY_ACCENT) as AccentKey) || "maroon";
    setModeState(m);
    setAccentState(a);
    applyMode(m);
    applyAccent(a);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const cur = (localStorage.getItem(KEY_MODE) as ThemeMode) || "light";
      if (cur === "system") applyMode("system");
    };
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    localStorage.setItem(KEY_MODE, m);
    applyMode(m);
  };
  const setAccent = (a: AccentKey) => {
    setAccentState(a);
    localStorage.setItem(KEY_ACCENT, a);
    applyAccent(a);
  };

  return (
    <AppearanceCtx.Provider value={{ mode, accent, setMode, setAccent }}>
      {children}
    </AppearanceCtx.Provider>
  );
}

export function useAppearance() {
  const c = useContext(AppearanceCtx);
  if (!c) throw new Error("useAppearance must be inside AppearanceProvider");
  return c;
}
