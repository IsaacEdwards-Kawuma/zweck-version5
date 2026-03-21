import { Navigate, Outlet } from "react-router-dom";

export default function Protected() {
  const token = localStorage.getItem("zweck_token");
  if (!token) return <Navigate to="/login" replace />;
  return <Outlet />;
}

