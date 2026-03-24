import api from "./client";

export async function getAboutPage() {
  const { data } = await api.get("/about-page");
  return data;
}

export async function updateAboutPage(payload) {
  const { data } = await api.put("/about-page", payload);
  return data;
}

export async function resetAboutPage() {
  const { data } = await api.delete("/about-page");
  return data;
}
