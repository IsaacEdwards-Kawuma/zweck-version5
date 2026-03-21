import api from "./client";

export async function listUsers() {
  const { data } = await api.get("/users");
  return data;
}

export async function getUser(id) {
  const { data } = await api.get(`/users/${id}`);
  return data;
}

