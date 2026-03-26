import api from "./client";

export async function getSettings() {
  const { data } = await api.get("/settings");
  return data;
}

/** Public health endpoint (same origin). Accepts 503 when DB is down so UI can show status. */
export async function getHealth() {
  const { data } = await api.get("/health", { validateStatus: (s) => s >= 200 && s < 600 });
  return data;
}

/** PATCH accepts any subset of { emailMeetingReminders, inAppMeetingReminders, inAppChatMessages }. */
export async function updateNotificationPreferences(partial) {
  const { data } = await api.patch("/settings/notifications", partial);
  return data;
}

/** Admin: PATCH accepts any subset of companyName, baseCurrency, fiscalYearStartMonth, defaultReportDays. */
export async function updateOrgSettings(partial) {
  const { data } = await api.patch("/settings/org", partial);
  return data;
}
