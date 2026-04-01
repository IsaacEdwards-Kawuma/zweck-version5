import { Navigate, Outlet, useLocation } from "react-router-dom";
import Loading from "./Loading";
import ErrorBanner from "./ErrorBanner";
import { useMe } from "../hooks/useMe";
import { isSecretaryRole, isUserRole } from "../lib/roles";

const authDisabled = import.meta.env.VITE_AUTH_DISABLED === "true";

/** Member home at `/user` is only for role USER; everyone else is sent to the main dashboard. */
export default function RequireUserRole() {
  const location = useLocation();
  const token = localStorage.getItem("zweck_token");
  const qMe = useMe(!authDisabled && Boolean(token));

  if (authDisabled) return <Outlet />;

  if (!token) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (qMe.isLoading) return <Loading label="Checking access..." />;
  if (qMe.isError) return <ErrorBanner error={qMe.error} />;

  if (!isUserRole(qMe.data?.role)) {
    return <Navigate to={isSecretaryRole(qMe.data?.role) ? "/secretary" : "/dashboard"} replace />;
  }
  return <Outlet />;
}
