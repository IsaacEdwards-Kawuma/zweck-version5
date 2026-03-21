import api from "./client";

export async function balances() {
  const { data } = await api.get("/accounts/balances");
  return data;
}

export async function directorsAll() {
  const { data } = await api.get("/accounts/directors/all");
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

