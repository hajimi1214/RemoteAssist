import { useEffect, useState } from "react";
import type { Theme } from "./ux";
import { readPreference, writePreference } from "./preferenceStore";

export function usePreferences() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = readPreference("remoteassist.theme"); return saved === "dark" || saved === "light" ? saved : "system";
  });
  const [largeText, setLargeText] = useState(() => readPreference("remoteassist.largeText") === "true");
  const [reducedMotion, setReducedMotion] = useState(() => readPreference("remoteassist.reducedMotion") === "true");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.text = largeText ? "large" : "standard";
    document.documentElement.dataset.motion = reducedMotion ? "reduced" : "full";
    writePreference("remoteassist.theme", theme);
    writePreference("remoteassist.largeText", String(largeText));
    writePreference("remoteassist.reducedMotion", String(reducedMotion));
  }, [theme, largeText, reducedMotion]);
  return { theme, setTheme, largeText, setLargeText, reducedMotion, setReducedMotion };
}
