import { Link } from "react-router-dom";

const toc = [
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

function Section({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{children}</div>
    </section>
  );
}

export default function HelpGuides() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight ui-page-heading">Help &amp; guides</h1>
        <p className="mt-1 text-sm ui-page-muted">
          Short tutorials for using ZweckOS day to day. Use the links below to jump to a topic.
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
          <p>
            The first time you sign in, a short welcome walkthrough may appear; you can skip it or use{" "}
            <Link className="font-medium text-brand-700 underline hover:text-brand-800 dark:text-brand-300" to="/help">
              Help &amp; guides
            </Link>{" "}
            anytime.
          </p>
          <p>
            After you sign in, the{" "}
            <Link className="font-medium text-brand-700 underline hover:text-brand-800 dark:text-brand-300" to="/">
              Dashboard
            </Link>{" "}
            shows key figures and shortcuts. The sidebar lists every main area of the app. Use{" "}
            <kbd className="rounded border border-slate-300 bg-slate-100 px-1 font-mono text-xs dark:border-slate-600 dark:bg-slate-800">
              /
            </kbd>{" "}
            (outside of text fields) to focus global search from anywhere.
          </p>
          <p>
            Your role (for example admin, member, or director) controls which pages you see and what you can change.
            Admins manage users and many org-wide settings; other roles can still post and view data they are allowed to
            access.
          </p>
        </Section>

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
            to record money movements: contributions, expenses, transfers between accounts, income, and more. Choose the
            transaction type first; the form then shows the fields that apply (amount, currency, director, project,
            counter-accounts, supporting document, and reference fields).
          </p>
          <p>
            Attach or link a document when your process requires evidence. References help you tie a posting to bank or
            external IDs. If something was posted incorrectly, use the reversal flow from the transaction detail or
            ledger where your workspace allows it, rather than editing posted history without controls.
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
            summarizes positions and performance in one place. Use it together with reports when presenting to the team
            or board.
          </p>
        </Section>

        <Section id="projects" title="Projects">
          <p>
            <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/projects">
              Projects
            </Link>{" "}
            tracks initiatives (including MMF/YPA-style structures where configured). Create or open a project to see
            tasks, timelines, and linked accounting where your deployment connects them. When posting, choose the project
            if the transaction belongs to that initiative so costs and revenue stay traceable.
          </p>
        </Section>

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
            is the register for important files: upload, categorize, and find them later. Prefer linking transactions to
            documents when audit trail matters.
          </p>
        </Section>

        <Section id="chat-notify" title="Chat & notifications">
          <p>
            <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/chat">
              Chat
            </Link>{" "}
            supports direct and group rooms, including meeting- or project-linked spaces. Use @mentions when you need
            someone’s attention; notification rules can be tuned under{" "}
            <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/settings#settings-notifications">
              Settings → Notifications
            </Link>
            .
          </p>
          <p>
            The bell in the top bar shows in-app notifications. You can mark items read, dismiss one by one, clear all,
            or filter to unread. Keyboard: press Escape to close the panel.
          </p>
        </Section>

        <Section id="reconciliation" title="Reconciliation">
          <p>
            <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/reconciliation">
              Reconciliation
            </Link>{" "}
            helps match internal balances to external statements or notes. Work through the checklist your team defines
            and attach notes where the product supports it.
          </p>
        </Section>

        <Section id="settings-roles" title="Settings & roles">
          <p>
            Open{" "}
            <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/settings">
              Settings
            </Link>{" "}
            for your profile, organization details, currencies, and notification preferences. Some sections are
            admin-only (users, audit-related options, and similar).
          </p>
          <p>
            Admins can open{" "}
            <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/users">
              Users
            </Link>{" "}
            to invite or manage accounts and{" "}
            <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/audit">
              Audit log
            </Link>{" "}
            to review sensitive actions when enabled.
          </p>
        </Section>

        <Section id="tips" title="Tips">
          <ul className="list-inside list-disc space-y-2">
            <li>Narrow date ranges in reports and the ledger before exporting large CSVs.</li>
            <li>Keep transaction descriptions clear; they appear in lists and exports.</li>
            <li>If you are unsure which type to use, ask your finance lead—wrong types can mis-route accounts.</li>
            <li>For compliance questions, also read{" "}
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
        </Section>
      </div>

      <p className="text-center text-xs text-slate-500 dark:text-slate-400">
        This guide describes typical ZweckOS workflows. Your administrator may have customized labels or policies.
      </p>
    </div>
  );
}
