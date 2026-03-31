import api from "./client";

export async function presenceHeartbeat() {
  const { data } = await api.post("/presence/heartbeat");
  return data;
}

export async function listPresence() {
  const { data } = await api.get("/presence");
  return data;
}
