import api from "./client";

/** Admin-only: records payload in audit log (webhook / automation test). */
export async function pingIntegration(payload) {
  const { data } = await api.post("/integrations/ping", payload ?? {});
  return data;
}
