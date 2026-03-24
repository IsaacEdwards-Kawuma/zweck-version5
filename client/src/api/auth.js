import api from "./client";

export async function login(email, password) {
  const { data } = await api.post("/auth/login", { email, password });
  return data;
}

export async function register(payload) {
  const { data } = await api.post("/auth/register", payload);
  return data;
}

export async function bootstrapStatus() {
  const { data } = await api.get("/auth/bootstrap-status");
  return data;
}

export async function me() {
  const { data } = await api.get("/auth/me");
  return data;
}

export async function logout() {
  const { data } = await api.post("/auth/logout");
  return data;
}

export async function forgotPassword(email) {
  const { data } = await api.post("/auth/forgot-password", { email });
  return data;
}

export async function resetPassword(token, password) {
  const { data } = await api.post("/auth/reset-password", { token, password });
  return data;
}

