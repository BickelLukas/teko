import { useEffect } from "react";
import type React from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMe } from "@/lib/api";

type Theme = "light" | "dark" | "system";

const THEME_KEY = "teko-theme";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = theme === "dark" || (theme === "system" && prefersDark);
  root.classList.toggle("dark", dark);
}

// Apply cached theme immediately at module load to avoid flash on subsequent visits
try {
  applyTheme(((localStorage.getItem(THEME_KEY) as Theme) ?? "system"));
} catch { /* localStorage unavailable */ }

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const theme = (me?.theme ?? (localStorage.getItem(THEME_KEY) as Theme | null) ?? "system") as Theme;

  useEffect(() => {
    applyTheme(theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* quota exceeded */ }
  }, [theme]);

  // Also react to system preference changes when theme is "system"
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return <>{children}</>;
}
