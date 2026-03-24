import api from "./client";

export async function trackReportEvent(payload) {
  const { data } = await api.post("/reports/events", payload);
  return data;
}

