import api from "./client";

export async function listAuditLogs(limit = 200) {
  const { data } = await api.get("/audit", { params: { limit } });
  return data;
}
