import { Link, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import OnboardingModal from "./OnboardingModal";
import { useMe } from "../hooks/useMe";

export default function Layout() {
  const token = localStorage.getItem("zweck_token");
  const qMe = useMe(Boolean(token));
  const showOnboarding = Boolean(token) && qMe.isSuccess && qMe.data && qMe.data.onboardingCompletedAt == null;
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- close drawer when route changes
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "/") return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) {
        return;
      }
      e.preventDefault();
      document.getElementById("global-search")?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="ui-ambient flex h-screen w-full overflow-hidden">
      <a
        href="#main-content"
        className="absolute left-4 top-0 z-[100] -translate-y-full rounded-b-lg bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow transition focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-slate-800 dark:text-brand-300 dark:ring-brand-400/50"
      >
        Skip to content
      </a>
      <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} me={qMe.data} />
      {showOnboarding ? <OnboardingModal /> : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onToggleNav={() => setMobileNavOpen((v) => !v)} />
        <main
          id="main-content"
          tabIndex={-1}
          className="ui-animate-in min-w-0 flex-1 overflow-y-auto bg-slate-50/40 p-3 outline-none print:bg-white sm:p-4 md:p-6 print:p-8 dark:bg-slate-950/30"
        >
          <Outlet context={{ me: qMe.data }} />
        </main>
        <footer
          className="border-t border-slate-200/80 px-4 py-3 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400 print:hidden"
          role="contentinfo"
        >
          <nav aria-label="Help and legal" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <Link className="hover:text-brand-700 dark:hover:text-brand-300" to="/help">
              Help
            </Link>
            <span aria-hidden className="text-slate-300 dark:text-slate-600">
              ·
            </span>
            <Link className="hover:text-brand-700 dark:hover:text-brand-300" to="/privacy">
              Privacy
            </Link>
            <span aria-hidden className="text-slate-300 dark:text-slate-600">
              ·
            </span>
            <Link className="hover:text-brand-700 dark:hover:text-brand-300" to="/legal/data-rights">
              Data &amp; privacy rights
            </Link>
          </nav>
        </footer>
      </div>
    </div>
  );
}

