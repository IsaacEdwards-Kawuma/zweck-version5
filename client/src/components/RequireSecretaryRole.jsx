import { Navigate, Outlet, useLocation } from "react-router-dom";
import Loading from "./Loading";
import ErrorBanner from "./ErrorBanner";
import { useMe } from "../hooks/useMe";
import { isSecretaryRole } from "../lib/roles";

const authDisabled = import.meta.env.VITE_AUTH_DISABLED === "true";

/** Secretary workspace at `/secretary` is only for role SECRETARY. */
export default function RequireSecretaryRole() {
  const location = useLocation();
  if (authDisabled) return <Outlet />;

  const token = localStorage.getItem("zweck_token");
  const qMe = useMe(Boolean(token));

  if (!token) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (qMe.isLoading) return <Loading label="Checking access..." />;
  if (qMe.isError) return <ErrorBanner error={qMe.error} />;

  if (!isSecretaryRole(qMe.data?.role)) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
