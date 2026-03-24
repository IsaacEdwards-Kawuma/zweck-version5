import api from "./client";

export async function listMeetings() {
  const { data } = await api.get("/meetings");
  return data;
}

export async function createMeeting(payload) {
  const { data } = await api.post("/meetings", payload);
  return data;
}

export async function updateMeeting(id, payload) {
  const { data } = await api.put(`/meetings/${id}`, payload);
  return data;
}

export async function deleteMeeting(id) {
  await api.delete(`/meetings/${id}`);
}

/** Download iCalendar feed (authenticated). */
export async function downloadMeetingsCalendarIcs() {
  const { data } = await api.get("/meetings/calendar.ics", { responseType: "blob" });
  const blob = data instanceof Blob ? data : new Blob([data], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "zweck-meetings.ics";
  a.click();
  URL.revokeObjectURL(url);
}
