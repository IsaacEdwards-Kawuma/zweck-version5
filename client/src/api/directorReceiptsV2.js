import api from "./client";

export async function listDirectorReceiptsV2(directorId) {
  const { data } = await api.get("/director-receipts-v2", { params: { directorId } });
  return data;
}

export async function markDirectorReceiptViewedV2(receiptId) {
  const { data } = await api.post(`/director-receipts-v2/${receiptId}/mark-viewed`);
  return data;
}

