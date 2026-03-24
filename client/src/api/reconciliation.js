import api from "./client";

export async function getReconciliationNote(periodFrom, statementDate) {
  const { data } = await api.get("/reconciliation", { params: { periodFrom, statementDate } });
  return data;
}

export async function saveReconciliationNote(payload) {
  const { data } = await api.put("/reconciliation", payload);
  return data;
}
