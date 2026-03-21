import axios from "axios";

const baseURL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

// HTTPS page (e.g. Vercel) cannot fetch http:// — browser blocks before CORS (status null in DevTools).
if (typeof window !== "undefined") {
  const pageIsHttps = window.location.protocol === "https:";
  const apiIsHttp = /^http:\/\//i.test(baseURL);
  if (pageIsHttps && apiIsHttp) {
    console.warn(
      "[Zweck] Page is HTTPS but VITE_API_URL is HTTP (often localhost). Browsers block mixed content — " +
        "set VITE_API_URL in Vercel to your HTTPS API (e.g. https://your-service.onrender.com/api), " +
        "or test locally with npm run dev at http://localhost:5173."
    );
  }
}

const api = axios.create({
  baseURL
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

