import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { useMe } from "../hooks/useMe";

export default function Layout() {
  const token = localStorage.getItem("zweck_token");
  const qMe = useMe(Boolean(token));

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar me={qMe.data} />
        <main className="min-w-0 flex-1 overflow-y-auto bg-slate-50 p-6">
          <Outlet context={{ me: qMe.data }} />
        </main>
      </div>
    </div>
  );
}

