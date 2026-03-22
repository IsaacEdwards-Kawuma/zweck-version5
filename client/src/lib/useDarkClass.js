import { useSyncExternalStore } from "react";

function subscribe(callback) {
  const el = document.documentElement;
  const obs = new MutationObserver(callback);
  obs.observe(el, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}

function getSnapshot() {
  return document.documentElement.classList.contains("dark");
}

/** True when the document root has the `dark` class (resolved light/dark theme). */
export function useDarkClass() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
