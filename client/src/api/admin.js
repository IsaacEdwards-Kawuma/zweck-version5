import api from "./client";

export async function downloadOrgBackupJson() {
  const { data } = await api.get("/admin/export");
  return data;
}
