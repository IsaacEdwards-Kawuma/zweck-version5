import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3001/api"
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("zweck_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status;
    if (status === 401) {
      localStorage.removeItem("zweck_token");
      if (!window.location.pathname.startsWith("/login")) window.location.replace("/login");
    }
    return Promise.reject(err);
  }
);

export default api;

