import api from "./client";

export async function searchWorkspace(q) {
  const { data } = await api.get("/search", { params: { q } });
  return data;
}
