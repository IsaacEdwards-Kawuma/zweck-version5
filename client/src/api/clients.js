import api from "./client";

export async function listClients() {
  const { data } = await api.get("/clients");
  return data;
}

export async function createClient(payload) {
  const { data } = await api.post("/clients", payload);
  return data;
}

export async function updateClient(id, payload) {
  const { data } = await api.put(`/clients/${id}`, payload);
  return data;
}

export async function deleteClient(id) {
  const { data } = await api.delete(`/clients/${id}`);
  return data;
}

