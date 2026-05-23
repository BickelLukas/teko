import { useEffect } from "react";
import type React from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMe } from "@/lib/api";
import { parseEnum } from "@/lib/utils";

const THEMES = ["light", "dark", "system"] as const;
type Theme = (typeof THEMES)[number];

const THEME_KEY = "teko-theme";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = theme === "dark" || (theme === "system" && prefersDark);
  root.classList.toggle("dark", dark);
}

function readStoredTheme(): Theme {
  try {
    return parseEnum(localStorage.getItem(THEME_KEY), THEMES, "system");
  } catch {
    return "system";
  }
}

// Apply cached theme immediately at module load to avoid flash on subsequent visits
applyTheme(readStoredTheme());

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const theme: Theme = me?.theme ?? readStoredTheme();

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* quota exceeded */
    }
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
