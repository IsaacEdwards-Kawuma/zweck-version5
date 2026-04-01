import { Link, useOutletContext } from "react-router-dom";
import PageHero from "../components/PageHero";
import { IconDashboard } from "../components/Icons";

function Card({ title, desc, to }) {
  return (
    <Link
      to={to}
      className="group ui-animate-pop rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md dark:border-slate-700/70 dark:bg-slate-900/70 dark:hover:border-brand-500/40"
    >
      <div className="text-sm font-semibold ui-page-heading">{title}</div>
      <div className="mt-1 text-sm ui-page-muted">{desc}</div>
      <div className="mt-3 text-xs font-semibold text-brand-700 group-hover:underline dark:text-brand-300">
        Open →
      </div>
    </Link>
  );
}

export default function UserDashboard() {
  const { me } = useOutletContext() || {};
  const name = me?.director?.name || (me?.email ? String(me.email).split("@")[0] : "User");

  return (
    <div className="space-y-6">
      <PageHero
        icon={IconDashboard}
        title={`Welcome, ${name}`}
        subtitle="Your workspace: documents, meetings, chat, and forms."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card title="Documents" desc="Browse company documents and downloads." to="/documents" />
        <Card title="Meetings" desc="View meeting schedules and minutes." to="/meetings" />
        <Card title="Chat" desc="Open chat rooms and messages." to="/chat" />
        <Card title="Forms" desc="Submit and track internal forms." to="/forms" />
        <Card title="Help & guides" desc="How-to guides and FAQs." to="/help" />
        <Card title="Settings" desc="Update your account and preferences." to="/settings" />
      </div>
    </div>
  );
}

