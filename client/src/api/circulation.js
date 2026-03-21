import api from "./client";

export async function listCirculation() {
  const { data } = await api.get("/circulation");
  return data;
}

export async function createCirculation(payload) {
  const { data } = await api.post("/circulation", payload);
  return data;
}

export async function updateCirculation(id, payload) {
  const { data } = await api.put(`/circulation/${id}`, payload);
  return data;
}

