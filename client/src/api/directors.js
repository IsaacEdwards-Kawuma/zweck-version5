import api from "./client";

export async function listDirectors() {
  const { data } = await api.get("/directors");
  return data;
}

export async function createDirector(payload) {
  const { data } = await api.post("/directors", payload);
  return data;
}

export async function updateDirector(id, payload) {
  const { data } = await api.put(`/directors/${id}`, payload);
  return data;
}

export async function getDirector(id) {
  const { data } = await api.get(`/directors/${id}`);
  return data;
}

export async function deleteDirector(id) {
  const { data } = await api.delete(`/directors/${id}`);
  return data;
}

export async function uploadDirectorAvatar(id, file) {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post(`/directors/${id}/avatar`, fd);
  return data;
}

export async function deleteDirectorAvatar(id) {
  const { data } = await api.delete(`/directors/${id}/avatar`);
  return data;
}

