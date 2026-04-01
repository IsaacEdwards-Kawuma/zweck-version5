import { Navigate, Outlet, useLocation } from "react-router-dom";
import Loading from "./Loading";
import ErrorBanner from "./ErrorBanner";
import { useMe } from "../hooks/useMe";
import { isSecretaryRole } from "../lib/roles";

const authDisabled = import.meta.env.VITE_AUTH_DISABLED === "true";

/**
 * `/secretary`, `/crm`, etc. — only role SECRETARY may access (no auth-disabled bypass).
 */
export default function RequireSecretaryRole() {
  const location = useLocation();
  const token = localStorage.getItem("zweck_token");
  const qMe = useMe(authDisabled || Boolean(token));

  if (!authDisabled && !token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (qMe.isLoading) return <Loading label="Checking access..." />;
  if (qMe.isError) return <ErrorBanner error={qMe.error} />;

  if (!isSecretaryRole(qMe.data?.role)) {
    return <Navigate to="/forbidden" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
