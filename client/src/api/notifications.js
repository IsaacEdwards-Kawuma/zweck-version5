import api from "./client";

export async function listNotifications(params = {}) {
  const { data } = await api.get("/notifications", { params: { limit: 30, ...params } });
  return data;
}

export async function markNotificationRead(id) {
  const { data } = await api.patch(`/notifications/${id}/read`);
  return data;
}

export async function markAllNotificationsRead() {
  const { data } = await api.post("/notifications/read-all");
  return data;
}
