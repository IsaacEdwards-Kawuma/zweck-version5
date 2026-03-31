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

export async function getPreviewReference() {
  const { data } = await api.get("/transactions/preview-reference");
  return data;
}

export async function postTransaction(payload) {
  const { data } = await api.post("/transactions", payload);
  return data;
}

/** Admin: post a reversing entry for a posted contribution. */
export async function reverseTransaction(id, payload) {
  const { data } = await api.post(`/transactions/${id}/reverse`, payload);
  return data;
}

export async function uploadTransactionDocument(file) {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post("/transactions/upload-document", fd);
  return data;
}

export async function getTransaction(id) {
  const { data } = await api.get(`/transactions/${id}`);
  return data;
}

export async function listDirectorDistributions(directorId) {
  const { data } = await api.get("/transactions/director-distributions", { params: { directorId } });
  return data;
}

export async function listDirectorLoans(directorId) {
  const { data } = await api.get("/transactions/director-loans", { params: { directorId } });
  return data;
}

/** Summary cards + distributions (with reinstatements) + loans (with repayments) for director detail. */
export async function getDirectorFinancialOverview(directorId) {
  const { data } = await api.get("/transactions/director-financial-overview", {
    params: { directorId }
  });
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

