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

/** PATCH accepts any subset of { emailMeetingReminders, inAppMeetingReminders, inAppChatMessages }. */
export async function updateNotificationPreferences(partial) {
  const { data } = await api.patch("/settings/notifications", partial);
  return data;
}
