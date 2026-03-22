const STORAGE_KEY = "zweck_theme";

/** @typedef {"light" | "dark" | "system"} ThemePreference */

/**
 * @returns {ThemePreference}
 */
export function getStoredTheme() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "system";
}

/**
 * @param {ThemePreference} pref
 */
export function setStoredTheme(pref) {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    /* ignore */
  }
}

/**
 * @param {ThemePreference} pref
 * @returns {"light" | "dark"}
 */
export function resolveTheme(pref) {
  if (pref === "dark") return "dark";
  if (pref === "light") return "light";
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

/**
 * @param {ThemePreference} pref
 */
export function applyTheme(pref) {
  const resolved = resolveTheme(pref);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved === "dark" ? "dark" : "light";

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", resolved === "dark" ? "#0f172a" : "#2563eb");
  }
}

/** Call once at app startup (before React paint). */
export function initTheme() {
  applyTheme(getStoredTheme());
  if (typeof window === "undefined") return;
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", () => {
    if (getStoredTheme() === "system") applyTheme("system");
  });
}
