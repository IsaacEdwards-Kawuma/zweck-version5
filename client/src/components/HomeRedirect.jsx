import { Navigate } from "react-router-dom";
import Loading from "./Loading";
import ErrorBanner from "./ErrorBanner";
import { useMe } from "../hooks/useMe";
import { isSecretaryRole, isTreasurerRole, isUserRole } from "../lib/roles";

const authDisabled = import.meta.env.VITE_AUTH_DISABLED === "true";

export default function HomeRedirect() {
  if (authDisabled) return <Navigate to="/dashboard" replace />;

  const token = localStorage.getItem("zweck_token");
  const qMe = useMe(Boolean(token));

  if (!token) return <Navigate to="/login" replace />;
  if (qMe.isLoading) return <Loading label="Loading..." />;
  if (qMe.isError) return <ErrorBanner error={qMe.error} />;

  const role = qMe.data?.role;
  if (isUserRole(role)) return <Navigate to="/user" replace />;
  if (isSecretaryRole(role)) return <Navigate to="/secretary" replace />;
  if (isTreasurerRole(role)) return <Navigate to="/treasurer" replace />;
  return <Navigate to="/dashboard" replace />;
}

