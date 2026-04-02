import { Navigate, Outlet, useLocation } from "react-router-dom";
import Loading from "./Loading";
import ErrorBanner from "./ErrorBanner";
import { useMe } from "../hooks/useMe";
import { isTreasurerRole } from "../lib/roles";

const authDisabled = import.meta.env.VITE_AUTH_DISABLED === "true";

/** Blocks TREASURER from governance / portfolio routes (redirect to treasurer home). */
export default function RequireNotTreasurer() {
  const location = useLocation();
  const token = localStorage.getItem("zweck_token");
  const qMe = useMe(!authDisabled && Boolean(token));

  if (authDisabled) return <Outlet />;

  if (!token) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (qMe.isLoading) return <Loading label="Checking access…" />;
  if (qMe.isError) return <ErrorBanner error={qMe.error} />;

  if (isTreasurerRole(qMe.data?.role)) {
    return <Navigate to="/treasurer" replace />;
  }

  return <Outlet />;
}
