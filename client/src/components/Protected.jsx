import { Navigate, Outlet } from "react-router-dom";

const authDisabled = import.meta.env.VITE_AUTH_DISABLED === "true";

export default function Protected() {
  if (authDisabled) return <Outlet />;
  const token = localStorage.getItem("zweck_token");
  if (!token) return <Navigate to="/login" replace />;
  return <Outlet />;
}

