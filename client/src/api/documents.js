import api from "./client";

export async function listDocuments() {
  const { data } = await api.get("/documents");
  return data;
}

export async function createDocument(payload) {
  const { data } = await api.post("/documents", payload);
  return data;
}

export async function updateDocument(id, payload) {
  const { data } = await api.put(`/documents/${id}`, payload);
  return data;
}

export async function deleteDocument(id) {
  await api.delete(`/documents/${id}`);
}
