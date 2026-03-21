import api from "./client";

export async function listTransactions(params) {
  const { data } = await api.get("/transactions", { params });
  return data;
}

export async function postTransaction(payload) {
  const { data } = await api.post("/transactions", payload);
  return data;
}

export async function deleteTransaction(id) {
  const { data } = await api.delete(`/transactions/${id}`);
  return data;
}

export async function updateTransaction(id, payload) {
  const { data } = await api.put(`/transactions/${id}`, payload);
  return data;
}

