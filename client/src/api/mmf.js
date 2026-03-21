import api from "./client";

export async function listMMF() {
  const { data } = await api.get("/mmf");
  return data;
}

export async function createMMF(payload) {
  const { data } = await api.post("/mmf", payload);
  return data;
}

export async function updateMMF(id, payload) {
  const { data } = await api.put(`/mmf/${id}`, payload);
  return data;
}

