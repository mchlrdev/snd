import { useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";
const KEY = "snd:theme";
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function read(): ThemePreference {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function apply(pref: ThemePreference) {
  const dark = pref === "dark" || (pref === "system" && media().matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** Light, dark or like the system. "System" follows changes live. */
export function useTheme() {
  const [pref, setPref] = useState<ThemePreference>(read);
  useEffect(() => {
    apply(pref);
    if (pref !== "system") return;
    const query = media();
    const onChange = () => apply("system");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [pref]);
  return {
    pref,
    set(next: ThemePreference) {
      try {
        localStorage.setItem(KEY, next);
      } catch {
        // Without storage the choice lasts until the next reload.
      }
      setPref(next);
    },
  };
}
