import api from "./client";

export async function getSettings() {
  const { data } = await api.get("/settings");
  return data;
}

/** Public health endpoint (same origin). */
export async function getHealth() {
  const { data } = await api.get("/health");
  return data;
}

export async function updateNotificationPreferences({ emailMeetingReminders }) {
  const { data } = await api.patch("/settings/notifications", { emailMeetingReminders });
  return data;
}
