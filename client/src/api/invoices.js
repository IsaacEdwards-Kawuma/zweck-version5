import api from "./client";

export async function listInvoices(params) {
  const { data } = await api.get("/invoices", { params });
  return data;
}

export async function invoiceMetrics() {
  const { data } = await api.get("/invoices/metrics");
  return data;
}

export async function getInvoice(id) {
  const { data } = await api.get(`/invoices/${id}`);
  return data;
}

/** Returns a Blob suitable for `URL.createObjectURL` / download. Parses JSON error bodies when the server does not return PDF. */
export async function downloadInvoicePdf(id) {
  const res = await api.get(`/invoices/${id}/pdf`, {
    responseType: "blob",
    validateStatus: () => true
  });
  if (res.status === 401) {
    localStorage.removeItem("zweck_token");
    if (import.meta.env.VITE_AUTH_DISABLED !== "true" && typeof window !== "undefined") {
      if (!window.location.pathname.startsWith("/login")) {
        window.location.replace("/login");
      }
    }
    throw new Error("Session expired. Please sign in again.");
  }
  const ct = String(res.headers["content-type"] || res.headers["Content-Type"] || "");
  if (res.status >= 200 && res.status < 300 && ct.includes("application/pdf") && res.data instanceof Blob) {
    return res.data;
  }
  let msg = `PDF download failed (${res.status})`;
  try {
    const text = res.data instanceof Blob ? await res.data.text() : String(res.data ?? "");
    const j = JSON.parse(text);
    if (j && typeof j.message === "string") msg = j.message;
    else if (j && typeof j.error === "string") msg = j.error;
  } catch {
    /* keep msg */
  }
  throw new Error(msg);
}

export async function createInvoice(payload) {
  const { data } = await api.post("/invoices", payload);
  return data;
}

export async function updateInvoice(id, payload) {
  const { data } = await api.put(`/invoices/${id}`, payload);
  return data;
}

export async function sendInvoice(id) {
  const { data } = await api.post(`/invoices/${id}/send`);
  return data;
}

export async function voidInvoice(id, reason) {
  const { data } = await api.post(`/invoices/${id}/void`, { reason });
  return data;
}

export async function addPayment(invoiceId, payload) {
  const { data } = await api.post(`/invoices/${invoiceId}/payments`, payload);
  return data;
}

export async function approveProforma(id) {
  const { data } = await api.post(`/invoices/${id}/proforma/approve`);
  return data;
}

export async function convertProforma(id) {
  const { data } = await api.post(`/invoices/${id}/proforma/convert`);
  return data;
}

export async function createCreditNote(originalInvoiceId, payload) {
  const { data } = await api.post(`/invoices/${originalInvoiceId}/credit-notes`, payload);
  return data;
}

