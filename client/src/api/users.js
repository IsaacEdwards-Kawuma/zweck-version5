import api from "./client";

export async function listUsers() {
  const { data } = await api.get("/users");
  return data;
}

export async function getUser(id) {
  const { data } = await api.get(`/users/${id}`);
  return data;
}

export async function updateUserRole(id, role) {
  const { data } = await api.patch(`/users/${id}/role`, { role });
  return data;
}

export async function listLoginEvents(limit = 200) {
  const { data } = await api.get("/users/login-events/all", { params: { limit } });
  return data;
}

export async function listMyLoginEvents(limit = 50) {
  const { data } = await api.get("/users/me/login-events", { params: { limit } });
  return data;
}

