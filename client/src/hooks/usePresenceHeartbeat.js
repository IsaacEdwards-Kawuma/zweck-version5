import { useEffect } from "react";
import { presenceHeartbeat } from "../api/presence";

const INTERVAL_MS = 45_000;

/**
 * Sends periodic heartbeats while the app is open so admins can see online/offline presence.
 * @param {boolean} enabled — false when not authenticated
 */
export function usePresenceHeartbeat(enabled) {
  useEffect(() => {
    if (!enabled) return undefined;

    const send = () => {
      presenceHeartbeat().catch(() => {});
    };

    send();
    const id = window.setInterval(send, INTERVAL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") send();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled]);
}
