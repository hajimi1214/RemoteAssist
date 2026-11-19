import { useEffect, useState } from "react";
import type { Theme } from "./ux";

export function usePreferences() {
  const [theme, setTheme] = useState<Theme>(() => {
    try { const saved = localStorage.getItem("remoteassist.theme"); return saved === "dark" || saved === "light" ? saved : "system"; } catch { return "system"; }
  });
  const [largeText, setLargeText] = useState(() => { try { return localStorage.getItem("remoteassist.largeText") === "true"; } catch { return false; } });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.text = largeText ? "large" : "standard";
    try { localStorage.setItem("remoteassist.theme", theme); localStorage.setItem("remoteassist.largeText", String(largeText)); } catch { /* In-memory preferences still work. */ }
  }, [theme, largeText]);
  return { theme, setTheme, largeText, setLargeText };
}
