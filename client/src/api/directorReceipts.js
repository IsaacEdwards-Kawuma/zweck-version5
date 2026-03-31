import api from "./client";

export async function listDirectorReceipts(directorId) {
  const { data } = await api.get("/director-receipts", { params: { directorId } });
  return data;
}

