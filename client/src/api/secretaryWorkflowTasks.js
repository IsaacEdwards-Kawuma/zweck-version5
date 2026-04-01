import api from "./client";

export async function listSecretaryWorkflowTasks() {
  const { data } = await api.get("/secretary-workflow-tasks");
  return data;
}

export async function listSecretaryAssignees() {
  const { data } = await api.get("/secretary-workflow-tasks/assignees");
  return data;
}

export async function createSecretaryWorkflowTask(payload) {
  const { data } = await api.post("/secretary-workflow-tasks", payload);
  return data;
}

export async function patchSecretaryWorkflowTask(id, payload) {
  const { data } = await api.patch(`/secretary-workflow-tasks/${id}`, payload);
  return data;
}

export async function moveSecretaryWorkflowTask(id, status) {
  const { data } = await api.patch(`/secretary-workflow-tasks/${id}/move`, { status });
  return data;
}

export async function deleteSecretaryWorkflowTask(id) {
  await api.delete(`/secretary-workflow-tasks/${id}`);
}
