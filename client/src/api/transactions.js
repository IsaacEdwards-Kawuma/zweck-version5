import api from "./client";

/**
 * @returns {Promise<{ items: unknown[], total: number, limit: number, offset: number, aggregates: { sumAmount: number, count: number, avgAmount: number, byType: Record<string, number> } }>}
 */
export async function listTransactions(params) {
  const { data } = await api.get("/transactions", { params });
  return data;
}

/** Normalize list response (always use after listTransactions). */
export function txItems(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  return res.items ?? [];
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

