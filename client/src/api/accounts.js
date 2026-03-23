import api from "./client";

export async function balances() {
  const { data } = await api.get("/accounts/balances");
  return data;
}

export async function directorsAll() {
  // Render/Vercel proxy sometimes struggles with 3+ path segments under `/api`.
  // Use the server alias `/accounts/directors` (2 segments after `/api`).
  const { data } = await api.get("/accounts/directors");
  return data;
}

export async function directorAccount(id) {
  const { data } = await api.get(`/accounts/director/${id}`);
  return data;
}

export async function summary() {
  const { data } = await api.get("/accounts/summary");
  return data;
}

