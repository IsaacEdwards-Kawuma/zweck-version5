import { Navigate } from "react-router-dom";
import Loading from "./Loading";
import ErrorBanner from "./ErrorBanner";
import { useMe } from "../hooks/useMe";
import { isUserRole } from "../lib/roles";

const authDisabled = import.meta.env.VITE_AUTH_DISABLED === "true";

export default function HomeRedirect() {
  if (authDisabled) return <Navigate to="/dashboard" replace />;

  const token = localStorage.getItem("zweck_token");
  const qMe = useMe(Boolean(token));

  if (!token) return <Navigate to="/login" replace />;
  if (qMe.isLoading) return <Loading label="Loading..." />;
  if (qMe.isError) return <ErrorBanner error={qMe.error} />;

  /** Only the USER role uses the member home at `/user`; everyone else (e.g. directors) lands on `/dashboard`. */
  return <Navigate to={isUserRole(qMe.data?.role) ? "/user" : "/dashboard"} replace />;
}

