import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { useMe } from "../hooks/useMe";

export default function Layout() {
  const token = localStorage.getItem("zweck_token");
  const qMe = useMe(Boolean(token));
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <a
        href="#main-content"
        className="absolute left-4 top-0 z-[100] -translate-y-full rounded-b-lg bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow transition focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-slate-800 dark:text-brand-300 dark:ring-brand-400/50"
      >
        Skip to content
      </a>
      <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onToggleNav={() => setMobileNavOpen((v) => !v)} />
        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 flex-1 overflow-y-auto bg-slate-50 p-3 outline-none print:bg-white sm:p-4 md:p-6 print:p-8 dark:bg-slate-950"
        >
          <Outlet context={{ me: qMe.data }} />
        </main>
      </div>
    </div>
  );
}

