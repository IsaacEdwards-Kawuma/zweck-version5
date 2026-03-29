import api from "./client";

/**
 * @param {{ status?: string, kind?: string, mine?: boolean }} [params]
 */
export async function listInternalForms(params = {}) {
  const { data } = await api.get("/internal-forms", {
    params: {
      ...(params.status ? { status: params.status } : {}),
      ...(params.kind ? { kind: params.kind } : {}),
      ...(params.mine ? { mine: "true" } : {})
    }
  });
  return data;
}

export async function createInternalForm(payload) {
  const { data } = await api.post("/internal-forms", payload);
  return data;
}

export async function decideInternalForm(id, payload) {
  const { data } = await api.patch(`/internal-forms/${id}/decision`, payload);
  return data;
}

export async function cancelInternalForm(id) {
  const { data } = await api.patch(`/internal-forms/${id}/cancel`);
  return data;
}
