/**
 * Human-readable message from API failures (Axios), network errors, or thrown values.
 */
export function getApiErrorMessage(err, fallback = "Something went wrong.") {
  if (err == null) return fallback;
  if (typeof err === "string") return err;

  const root = err.cause ?? err;
  const data = root.response?.data;
  if (data && typeof data === "object") {
    if (typeof data.message === "string" && data.message.trim()) return data.message;
    if (typeof data.error === "string" && data.error.trim()) return data.error;
  }
  if (typeof data === "string" && data.trim()) return data;

  if (root.code === "ECONNABORTED" || root.message?.includes("timeout")) {
    return "Request timed out. Check your connection and try again.";
  }
  if (!root.response && root.message === "Network Error") {
    return "Network error. Check your connection or try again.";
  }
  if (!root.response) {
    return root.message || fallback;
  }

  const status = root.response.status;
  if (status === 403) return "You do not have permission to do that.";
  if (status === 404) {
    if (typeof data?.message === "string" && data.message.trim()) return data.message;
    return (
      "Not found (404). Check the API URL: VITE_API_URL should be your Render host (https://…onrender.com); " +
        "/api is added automatically. On Vercel use RENDER_API_URL without /api."
    );
  }
  if (status === 409) return data?.message || "This action conflicts with existing data.";
  if (status >= 500) return "The server had a problem. Try again later.";

  return root.message || fallback;
}
