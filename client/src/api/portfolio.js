import api from "./client";

export async function portfolio() {
  const { data } = await api.get("/portfolio");
  return data;
}

