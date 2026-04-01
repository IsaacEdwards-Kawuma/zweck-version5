import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Loading from "../components/Loading";
import { getSettings } from "../api/settings";
import { hasAdminPrivileges, isSecretaryRole, isStaffRole, isUserRole } from "../lib/roles";

const TOC_STAFF = [
  { id: "start", label: "Getting started" },
  { id: "dashboard-reports", label: "Dashboard & reports" },
  { id: "transactions", label: "Posting transactions" },
  { id: "ledger-accounts", label: "Ledger & chart of accounts" },
  { id: "directors-portfolio", label: "Directors & portfolio" },
  { id: "projects", label: "Projects" },
  { id: "meetings-docs", label: "Meetings & documents" },
  { id: "chat-notify", label: "Chat & notifications" },
  { id: "reconciliation", label: "Reconciliation" },
  { id: "settings-roles", label: "Settings & roles" },
  { id: "tips", label: "Tips" }
];

const TOC_MEMBER = [
  { id: "start", label: "Getting started" },
  { id: "user-dashboard", label: "Your dashboard" },
  { id: "meetings-docs", label: "Meetings & documents" },
  { id: "forms", label: "Forms" },
  { id: "invoices", label: "Invoices" },
  { id: "chat-notify", label: "Chat & notifications" },
  { id: "settings-roles", label: "Settings & profile" },
  { id: "tips", label: "Tips" }
];

const TOC_SECRETARY = [
  { id: "start", label: "Getting started" },
  { id: "secretary-dashboard", label: "Secretary dashboard" },
  { id: "meetings-docs", label: "Meetings & documents" },
  { id: "forms", label: "Forms" },
  { id: "invoices", label: "Invoices" },
  { id: "chat-notify", label: "Chat & notifications" },
  { id: "settings-roles", label: "Settings & profile" },
  { id: "tips", label: "Tips" }
];

/** Non-staff roles that are not USER (e.g. director): home is `/dashboard`, not `/user`. */
const TOC_MEMBER_OTHER = [
  { id: "start", label: "Getting started" },
  { id: "home-overview", label: "Dashboard overview" },
  { id: "meetings-docs", label: "Meetings & documents" },
  { id: "forms", label: "Forms" },
  { id: "invoices", label: "Invoices" },
  { id: "chat-notify", label: "Chat & notifications" },
  { id: "settings-roles", label: "Settings & profile" },
  { id: "tips", label: "Tips" }
];

function Section({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{children}</div>
    </section>
  );
}

export default function HelpGuides() {
  const qSettings = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const role = qSettings.data?.session?.role;
  const staff = isStaffRole(role);
  const isUser = isUserRole(role);
  const isSecretary = isSecretaryRole(role);
  const isAdmin = hasAdminPrivileges(role);
  const toc = staff ? TOC_STAFF : isUser ? TOC_MEMBER : isSecretary ? TOC_SECRETARY : TOC_MEMBER_OTHER;

  if (qSettings.isLoading) {
    return <Loading label="Loading help…" />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight ui-page-heading">Help &amp; guides</h1>
        <p className="mt-1 text-sm ui-page-muted">
          {staff
            ? "Short tutorials for using ZweckOS day to day. Use the links below to jump to a topic."
            : "Short tutorials for the areas available in your account. Use the links below to jump to a topic."}
        </p>
      </div>

      <nav
        aria-label="On this page"
        className="ui-surface rounded-xl border border-slate-200/80 p-4 dark:border-slate-700/80"
      >
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Contents</div>
        <ol className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {toc.map((item, i) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300"
              >
                {i + 1}. {item.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="ui-surface space-y-10 rounded-xl p-6 sm:p-8">
        <Section id="start" title="Getting started">
          {staff ? (
            <>
              <p>
                The first time you sign in, a short welcome walkthrough may appear; you can skip it or use{" "}
                <Link className="font-medium text-brand-700 underline hover:text-brand-800 dark:text-brand-300" to="/help">
                  Help &amp; guides
                </Link>{" "}
                anytime.
              </p>
              <p>
                After you sign in, the{" "}
                <Link className="font-medium text-brand-700 underline hover:text-brand-800 dark:text-brand-300" to="/dashboard">
                  Dashboard
                </Link>{" "}
                shows key figures and shortcuts. The sidebar lists every main area of the app. Use{" "}
                <kbd className="rounded border border-slate-300 bg-slate-100 px-1 font-mono text-xs dark:border-slate-600 dark:bg-slate-800">
                  /
                </kbd>{" "}
                (outside of text fields) to focus global search from anywhere.
              </p>
              <p>
                Your role (for example admin, treasurer, director, CEO, or operational manager) controls which pages you
                see and what you can change. Admins manage users and many org-wide settings; other roles can still post
                and view data they are allowed to access.
              </p>
            </>
          ) : isUser ? (
            <>
              <p>
                The first time you sign in, a short welcome walkthrough may appear; you can skip it or use{" "}
                <Link className="font-medium text-brand-700 underline hover:text-brand-800 dark:text-brand-300" to="/help">
                  Help &amp; guides
                </Link>{" "}
                anytime.
              </p>
              <p>
                After you sign in, open{" "}
                <Link className="font-medium text-brand-700 underline hover:text-brand-800 dark:text-brand-300" to="/user">
                  Your dashboard
                </Link>{" "}
                for meetings, documents, chat, forms, and notifications in one place. The sidebar lists the areas your
                organization has enabled for your role. Use{" "}
                <kbd className="rounded border border-slate-300 bg-slate-100 px-1 font-mono text-xs dark:border-slate-600 dark:bg-slate-800">
                  /
                </kbd>{" "}
                (outside of text fields) to focus global search from anywhere.
              </p>
              <p>
                Financial reporting, posting, ledger, and similar tools are available only to designated staff. If you need
                access, ask your administrator.
              </p>
            </>
          ) : isSecretary ? (
            <>
              <p>
                The first time you sign in, a short welcome walkthrough may appear; you can skip it or use{" "}
                <Link className="font-medium text-brand-700 underline hover:text-brand-800 dark:text-brand-300" to="/help">
                  Help &amp; guides
                </Link>{" "}
                anytime.
              </p>
              <p>
                After you sign in, open your{" "}
                <Link className="font-medium text-brand-700 underline hover:text-brand-800 dark:text-brand-300" to="/secretary">
                  Secretary dashboard
                </Link>{" "}
                for meetings, documents, chat, and coordination. The sidebar lists the areas your organization has
                enabled. Use{" "}
                <kbd className="rounded border border-slate-300 bg-slate-100 px-1 font-mono text-xs dark:border-slate-600 dark:bg-slate-800">
                  /
                </kbd>{" "}
                (outside of text fields) to focus global search from anywhere.
              </p>
              <p>
                Financial posting, ledger, and projects are limited to designated staff roles. Use the main{" "}
                <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/dashboard">
                  Dashboard
                </Link>{" "}
                only if your administrator also assigns you a role with that access.
              </p>
            </>
          ) : (
            <>
              <p>
                The first time you sign in, a short welcome walkthrough may appear; you can skip it or use{" "}
                <Link className="font-medium text-brand-700 underline hover:text-brand-800 dark:text-brand-300" to="/help">
                  Help &amp; guides
                </Link>{" "}
                anytime.
              </p>
              <p>
                After you sign in, the{" "}
                <Link className="font-medium text-brand-700 underline hover:text-brand-800 dark:text-brand-300" to="/dashboard">
                  Dashboard
                </Link>{" "}
                summarizes organization figures and recent activity available to your role. The sidebar lists the areas
                your organization has enabled. Use{" "}
                <kbd className="rounded border border-slate-300 bg-slate-100 px-1 font-mono text-xs dark:border-slate-600 dark:bg-slate-800">
                  /
                </kbd>{" "}
                (outside of text fields) to focus global search from anywhere.
              </p>
              <p>
                Financial posting, ledger, projects, and similar staff workflows are available only to designated staff
                roles. If you need access, ask your administrator.
              </p>
            </>
          )}
        </Section>

        {staff ? (
          <>
            <Section id="dashboard-reports" title="Dashboard & reports">
              <p>
                The dashboard summarizes balances and activity. Open{" "}
                <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/reports">
                  Reports
                </Link>{" "}
                for period views, charts, and exports. Pick a date range and, where available, filter by director or
                category to match how you review the books.
              </p>
            </Section>

            <Section id="transactions" title="Posting transactions">
              <p>
                Use{" "}
                <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/post">
                  Post Transaction
                </Link>{" "}
                to record money movements: contributions, expenses, transfers between accounts, income, and more. Choose
                the transaction type first; the form then shows the fields that apply (amount, currency, director,
                project, counter-accounts, supporting document, and reference fields).
              </p>
              <p>
                Attach or link a document when your process requires evidence. References help you tie a posting to bank
                or external IDs. If something was posted incorrectly, use the reversal flow from the transaction detail
                or ledger where your workspace allows it, rather than editing posted history without controls.
              </p>
            </Section>

            <Section id="ledger-accounts" title="Ledger & chart of accounts">
              <p>
                The{" "}
                <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/ledger">
                  Ledger
                </Link>{" "}
                lists posted lines newest first. Filter by date, type, or director, then open a line to see context. Export
                CSV when you need a spreadsheet for review or sharing (respecting your data policy).
              </p>
              <p>
                The{" "}
                <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/accounts">
                  Chart of Accounts
                </Link>{" "}
                defines account codes and names used in reporting. Keep naming consistent so everyone reads the same
                structure in reports and portfolios.
              </p>
            </Section>

            <Section id="directors-portfolio" title="Directors & portfolio">
              <p>
                <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/directors">
                  Directors
                </Link>{" "}
                holds profiles and links to each director’s capital and related activity. Open a director to see their
                history and statements where enabled.
              </p>
              <p>
                <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/portfolio">
                  Portfolio
                </Link>{" "}
                summarizes positions and performance in one place. Use it together with reports when presenting to the
                team or board.
              </p>
            </Section>

            <Section id="projects" title="Projects">
              <p>
                <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/projects">
                  Projects
                </Link>{" "}
                tracks initiatives (including MMF/YPA-style structures where configured). Create or open a project to see
                tasks, timelines, and linked accounting where your deployment connects them. When posting, choose the
                project if the transaction belongs to that initiative so costs and revenue stay traceable.
              </p>
            </Section>
          </>
        ) : isUser ? (
          <Section id="user-dashboard" title="Your dashboard">
            <p>
              <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/user">
                Your dashboard
              </Link>{" "}
              is your home page: profile and announcements, documents and meetings, chat, internal forms, and
              notifications. You can pin or reorder sections when customization is available.
            </p>
            <p>
              Open the full{" "}
              <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/notifications">
                Notifications
              </Link>{" "}
              page from the bell or from unread counts when shown.
            </p>
          </Section>
        ) : isSecretary ? (
          <Section id="secretary-dashboard" title="Secretary dashboard">
            <p>
              <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/secretary">
                Secretary dashboard
              </Link>{" "}
              is your home page for meetings, documents, chat, forms, and notifications. You can refresh KPIs and jump to
              common workflows from the quick access grid.
            </p>
            <p>
              Open{" "}
              <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/notifications">
                Notifications
              </Link>{" "}
              from the bell for the full list. The main financial{" "}
              <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/dashboard">
                Dashboard
              </Link>{" "}
              remains available from the footer link if you also use a staff-capable role.
            </p>
          </Section>
        ) : (
          <Section id="home-overview" title="Dashboard overview">
            <p>
              The{" "}
              <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/dashboard">
                Dashboard
              </Link>{" "}
              is your home page for balances and activity summaries shown to your role, with shortcuts elsewhere in the
              app.
            </p>
            <p>
              Open{" "}
              <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/notifications">
                Notifications
              </Link>{" "}
              from the bell for the full list when available.
            </p>
          </Section>
        )}

        <Section id="meetings-docs" title="Meetings & documents">
          <p>
            Schedule and review sessions under{" "}
            <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/meetings">
              Meetings
            </Link>
            . Calendar and reminder options depend on your org settings.
          </p>
          <p>
            <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/documents">
              Documents
            </Link>{" "}
            is the register for important files: upload, categorize, and find them later.
            {staff
              ? " Prefer linking transactions to documents when audit trail matters."
              : " Your team may attach files to workflows where the product allows it."}
          </p>
        </Section>

        {!staff ? (
          <>
            <Section id="forms" title="Forms">
              <p>
                Use{" "}
                <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/forms">
                  Forms
                </Link>{" "}
                for internal requests and submissions your organization publishes. You can often save a draft and return
                later; submit when complete.
              </p>
            </Section>

            <Section id="invoices" title="Invoices">
              <p>
                <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/invoices">
                  Invoices
                </Link>{" "}
                lists billing documents where your deployment uses them. Create or open an invoice from there, depending
                on your permissions.
              </p>
            </Section>
          </>
        ) : null}

        <Section id="chat-notify" title="Chat & notifications">
          <p>
            <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/chat">
              Chat
            </Link>{" "}
            supports direct and group rooms
            {staff ? ", including meeting- or project-linked spaces" : ""}. Use @mentions when you need someone’s
            attention; notification rules can be tuned under{" "}
            <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/settings#settings-notifications">
              Settings → Notifications
            </Link>
            .
          </p>
          <p>
            The bell in the top bar shows in-app notifications. Open{" "}
            <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/notifications">
              Notifications
            </Link>{" "}
            for the full list. You can mark items read, dismiss one by one, clear all, or filter to unread. Keyboard:
            press Escape to close the panel.
          </p>
        </Section>

        {staff ? (
          <Section id="reconciliation" title="Reconciliation">
            <p>
              <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/reconciliation">
                Reconciliation
              </Link>{" "}
              helps match internal balances to external statements or notes. Work through the checklist your team defines
              and attach notes where the product supports it.
            </p>
          </Section>
        ) : null}

        <Section id="settings-roles" title={staff ? "Settings & roles" : "Settings & profile"}>
          <p>
            Open{" "}
            <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/settings">
              Settings
            </Link>{" "}
            for your profile, organization details where shown, currencies, theme, and notification preferences.
            {staff ? " Some sections are admin-only (users, audit-related options, and similar)." : ""}
          </p>
          {staff && isAdmin ? (
            <p>
              Administrators can open{" "}
              <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/users">
                Users
              </Link>{" "}
              to invite or manage accounts and{" "}
              <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/audit">
                Audit log
              </Link>{" "}
              to review sensitive actions when enabled.
            </p>
          ) : null}
          {!staff ? (
            <p>
              User management and audit tools are limited to administrators. Contact an admin if you need an account
              change or access to additional areas.
            </p>
          ) : null}
        </Section>

        <Section id="tips" title="Tips">
          {staff ? (
            <ul className="list-inside list-disc space-y-2">
              <li>Narrow date ranges in reports and the ledger before exporting large CSVs.</li>
              <li>Keep transaction descriptions clear; they appear in lists and exports.</li>
              <li>If you are unsure which type to use, ask your finance lead—wrong types can mis-route accounts.</li>
              <li>
                For compliance questions, also read{" "}
                <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/privacy">
                  Privacy
                </Link>{" "}
                and{" "}
                <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/legal/data-rights">
                  Data &amp; privacy rights
                </Link>
                .
              </li>
            </ul>
          ) : (
            <ul className="list-inside list-disc space-y-2">
              <li>Pin important documents and meetings on your dashboard when customization is available.</li>
              <li>Save long forms as drafts and submit when you have everything ready.</li>
              <li>
                For compliance questions, read{" "}
                <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/privacy">
                  Privacy
                </Link>{" "}
                and{" "}
                <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/legal/data-rights">
                  Data &amp; privacy rights
                </Link>
                .
              </li>
            </ul>
          )}
        </Section>
      </div>

      <p className="text-center text-xs text-slate-500 dark:text-slate-400">
        This guide describes typical ZweckOS workflows. Your administrator may have customized labels or policies.
      </p>
    </div>
  );
}
