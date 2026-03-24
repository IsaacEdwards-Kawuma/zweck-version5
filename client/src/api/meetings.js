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
