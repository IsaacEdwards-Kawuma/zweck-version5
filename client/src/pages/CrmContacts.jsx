import { Link, useNavigate, useParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import PageHero, { SectionTitle } from "../components/PageHero";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import { IconBolt, IconCalendar, IconClipboard, IconUsers } from "../components/Icons";
import { listMeetings } from "../api/meetings";
import { listDocuments } from "../api/documents";
import {
  listCrmContacts,
  getCrmContact,
  createCrmContact,
  updateCrmContact,
  deleteCrmContact,
  createCrmInteraction,
  deleteCrmInteraction,
  createCrmReminder,
  updateCrmReminder,
  deleteCrmReminder,
  linkCrmDocument,
  unlinkCrmDocument
} from "../api/crm";

const TAG_PRESETS = ["VIP", "supplier", "partner"];
const INTERACTION_TYPES = [
  { value: "CALL", label: "Call" },
  { value: "EMAIL", label: "Email" },
  { value: "MEETING", label: "Meeting" },
  { value: "NOTE", label: "Note" },
  { value: "OTHER", label: "Other" }
];

function parseTags(raw) {
  if (Array.isArray(raw)) return raw.filter((t) => typeof t === "string");
  if (raw && typeof raw === "string") {
    try {
      const j = JSON.parse(raw);
      return Array.isArray(j) ? j : [];
    } catch {
      return [];
    }
  }
  return [];
}

function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div className="ui-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal>
      <button type="button" className="absolute inset-0 bg-slate-950/50" aria-label="Close" onClick={onClose} />
      <div className="ui-modal-panel relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold ui-page-heading">{title}</h2>
          <button type="button" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export default function CrmContacts() {
  const { contactId } = useParams();
  const id = contactId ? Number(contactId) : NaN;
  const nav = useNavigate();
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [tab, setTab] = useState("details");

  const qList = useQuery({ queryKey: ["crm-contacts"], queryFn: listCrmContacts });
  const qDetail = useQuery({
    queryKey: ["crm-contact", id],
    queryFn: () => getCrmContact(id),
    enabled: Number.isFinite(id)
  });
  const qMeetings = useQuery({ queryKey: ["meetings"], queryFn: listMeetings });
  const qDocs = useQuery({ queryKey: ["documents"], queryFn: listDocuments });

  const filtered = useMemo(() => {
    const rows = Array.isArray(qList.data) ? qList.data : [];
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      const tags = parseTags(r.tags);
      if (tagFilter && !tags.map((t) => t.toLowerCase()).includes(tagFilter.toLowerCase())) return false;
      if (!qq) return true;
      const hay = `${r.name} ${r.company || ""} ${r.email || ""} ${r.phone || ""}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [qList.data, q, tagFilter]);

  const mCreate = useMutation({
    mutationFn: createCrmContact,
    onSuccess: async (row) => {
      await qc.invalidateQueries({ queryKey: ["crm-contacts"] });
      setCreateOpen(false);
      if (row?.id) nav(`/crm/${row.id}`);
    }
  });
  const mUpdate = useMutation({
    mutationFn: ({ cid, payload }) => updateCrmContact(cid, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["crm-contacts"] });
      await qc.invalidateQueries({ queryKey: ["crm-contact", id] });
    }
  });
  const mDelete = useMutation({
    mutationFn: deleteCrmContact,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["crm-contacts"] });
      nav("/crm");
    }
  });

  const mIx = useMutation({
    mutationFn: ({ cid, payload }) => createCrmInteraction(cid, payload),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["crm-contact", id] })
  });
  const mIxDel = useMutation({
    mutationFn: deleteCrmInteraction,
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["crm-contact", id] })
  });
  const mRem = useMutation({
    mutationFn: ({ cid, payload }) => createCrmReminder(cid, payload),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["crm-contact", id] })
  });
  const mRemUp = useMutation({
    mutationFn: ({ rid, payload }) => updateCrmReminder(rid, payload),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["crm-contact", id] })
  });
  const mRemDel = useMutation({
    mutationFn: deleteCrmReminder,
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["crm-contact", id] })
  });
  const mLink = useMutation({
    mutationFn: ({ cid, payload }) => linkCrmDocument(cid, payload),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["crm-contact", id] })
  });
  const mUnlink = useMutation({
    mutationFn: unlinkCrmDocument,
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["crm-contact", id] })
  });

  if (qList.isLoading) return <Loading label="Loading contacts…" />;
  if (qList.error) return <ErrorBanner error={qList.error} />;
  if (Number.isFinite(id) && qDetail.isLoading) return <Loading label="Loading contact…" />;
  if (Number.isFinite(id) && qDetail.error) return <ErrorBanner error={qDetail.error} />;

  const detail = qDetail.data;
  const meetings = Array.isArray(qMeetings.data) ? qMeetings.data : [];
  const allDocs = Array.isArray(qDocs.data) ? qDocs.data : [];

  return (
    <div className="space-y-6 pb-10">
      <PageHero
        icon={IconUsers}
        title="Contacts &amp; client management"
        subtitle="Mini CRM for the company secretary — profiles, interactions, documents, reminders, and meeting links."
      >
        <button type="button" className="ui-btn-outline" onClick={() => setCreateOpen(true)}>
          New contact
        </button>
        <Link className="ui-btn-outline" to="/secretary">
          Secretary home
        </Link>
      </PageHero>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
        <aside className="ui-surface space-y-3 rounded-2xl p-4">
          <input
            className="ui-input w-full"
            placeholder="Search name, company, email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className={[!tagFilter ? "bg-brand-100 text-brand-900 dark:bg-brand-900/50 dark:text-brand-100" : "bg-slate-100 dark:bg-slate-800", "rounded-full px-2 py-0.5 text-xs font-medium"].join(" ")}
              onClick={() => setTagFilter("")}
            >
              All
            </button>
            {TAG_PRESETS.map((t) => (
              <button
                key={t}
                type="button"
                className={[
                  tagFilter === t ? "bg-brand-100 text-brand-900 dark:bg-brand-900/50" : "bg-slate-100 dark:bg-slate-800",
                  "rounded-full px-2 py-0.5 text-xs font-medium"
                ].join(" ")}
                onClick={() => setTagFilter(tagFilter === t ? "" : t)}
              >
                {t}
              </button>
            ))}
          </div>
          <ul className="max-h-[60vh] space-y-1 overflow-y-auto">
            {filtered.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/crm/${r.id}`}
                  className={[
                    "block rounded-xl border px-3 py-2.5 text-sm transition",
                    r.id === id
                      ? "border-brand-400 bg-brand-50/80 dark:border-brand-600 dark:bg-brand-950/40"
                      : "border-transparent hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-700 dark:hover:bg-slate-800/80"
                  ].join(" ")}
                >
                  <div className="font-semibold text-slate-900 dark:text-slate-50">{r.name}</div>
                  {r.company ? <div className="text-xs text-slate-500">{r.company}</div> : null}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {parseTags(r.tags).map((t) => (
                      <span key={t} className="rounded bg-slate-200/80 px-1.5 py-0 text-[10px] font-medium uppercase text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                        {t}
                      </span>
                    ))}
                  </div>
                </Link>
              </li>
            ))}
            {!filtered.length ? <li className="text-sm text-slate-500">No contacts match.</li> : null}
          </ul>
        </aside>

        <section className="min-w-0 space-y-4">
          {!Number.isFinite(id) ? (
            <div className="ui-surface rounded-2xl p-8 text-center text-slate-600 dark:text-slate-300">
              <IconClipboard className="mx-auto h-12 w-12 text-slate-400" aria-hidden />
              <p className="mt-3 text-lg font-medium">Select a contact or create one</p>
              <p className="mt-1 text-sm">Track interactions, link documents from the register, and set follow-up reminders.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">{detail.name}</h2>
                  {detail.company ? <p className="text-slate-600 dark:text-slate-300">{detail.company}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="ui-btn-outline text-rose-700 dark:text-rose-300"
                    onClick={() => {
                      if (window.confirm("Delete this contact?")) mDelete.mutate(id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2 dark:border-slate-700">
                {["details", "activity", "documents", "reminders", "meetings"].map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={[
                      "rounded-lg px-3 py-1.5 text-sm font-medium capitalize",
                      tab === k ? "bg-brand-100 text-brand-900 dark:bg-brand-900/50 dark:text-brand-100" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    ].join(" ")}
                    onClick={() => setTab(k)}
                  >
                    {k === "activity" ? "Interactions" : k}
                  </button>
                ))}
              </div>

              {tab === "details" ? (
                <ContactDetailsForm
                  key={id}
                  detail={detail}
                  onSave={(payload) => mUpdate.mutate({ cid: id, payload })}
                  busy={mUpdate.isPending}
                />
              ) : null}

              {tab === "activity" ? (
                <ActivityPanel
                  detail={detail}
                  meetings={meetings}
                  onAdd={(payload) => mIx.mutate({ cid: id, payload })}
                  onDelete={(iid) => mIxDel.mutate(iid)}
                  busy={mIx.isPending}
                />
              ) : null}

              {tab === "documents" ? (
                <DocumentsPanel
                  detail={detail}
                  allDocs={allDocs}
                  onLink={(payload) => mLink.mutate({ cid: id, payload })}
                  onUnlink={(linkId) => mUnlink.mutate(linkId)}
                  busy={mLink.isPending}
                />
              ) : null}

              {tab === "reminders" ? (
                <RemindersPanel
                  detail={detail}
                  onAdd={(payload) => mRem.mutate({ cid: id, payload })}
                  onToggle={(rid, done) => mRemUp.mutate({ rid, payload: { done } })}
                  onDelete={(rid) => mRemDel.mutate(rid)}
                  busy={mRem.isPending || mRemUp.isPending}
                />
              ) : null}

              {tab === "meetings" ? <MeetingsPanel detail={detail} /> : null}
            </>
          )}
        </section>
      </div>

      <Modal open={createOpen} title="New contact" onClose={() => setCreateOpen(false)}>
        <ContactDetailsForm
          key={createOpen ? "create-open" : "create"}
          detail={{ name: "", company: "", phone: "", email: "", address: "", notes: "", tags: [] }}
          isNew
          onSave={(payload) => mCreate.mutate(payload)}
          busy={mCreate.isPending}
          onCancel={() => setCreateOpen(false)}
        />
      </Modal>
    </div>
  );
}

function ContactDetailsForm({ detail, onSave, busy, isNew, onCancel }) {
  const [name, setName] = useState(detail.name || "");
  const [company, setCompany] = useState(detail.company || "");
  const [phone, setPhone] = useState(detail.phone || "");
  const [email, setEmail] = useState(detail.email || "");
  const [address, setAddress] = useState(detail.address || "");
  const [notes, setNotes] = useState(detail.notes || "");
  const [tags, setTags] = useState(parseTags(detail.tags));
  const [customTag, setCustomTag] = useState("");

  function togglePreset(t) {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  function addCustom() {
    const t = customTag.trim();
    if (!t || tags.includes(t)) return;
    setTags([...tags, t.slice(0, 40)]);
    setCustomTag("");
  }

  return (
    <div className="ui-surface space-y-4 rounded-2xl p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-slate-600 dark:text-slate-400">Name *</span>
          <input className="ui-input mt-1 w-full" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600 dark:text-slate-400">Company</span>
          <input className="ui-input mt-1 w-full" value={company} onChange={(e) => setCompany(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600 dark:text-slate-400">Phone</span>
          <input className="ui-input mt-1 w-full" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600 dark:text-slate-400">Email</span>
          <input className="ui-input mt-1 w-full" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-slate-600 dark:text-slate-400">Address</span>
        <textarea className="ui-textarea mt-1 w-full" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
      </label>
      <label className="block text-sm">
        <span className="text-slate-600 dark:text-slate-400">Notes</span>
        <textarea className="ui-textarea mt-1 w-full" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div>
        <div className="text-sm text-slate-600 dark:text-slate-400">Tags</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {TAG_PRESETS.map((t) => (
            <button
              key={t}
              type="button"
              className={[
                "rounded-full border px-2.5 py-1 text-xs font-medium",
                tags.includes(t) ? "border-brand-500 bg-brand-50 text-brand-900 dark:bg-brand-950/50 dark:text-brand-100" : "border-slate-200 dark:border-slate-600"
              ].join(" ")}
              onClick={() => togglePreset(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input className="ui-input flex-1" placeholder="Custom tag" value={customTag} onChange={(e) => setCustomTag(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustom())} />
          <button type="button" className="ui-btn-outline" onClick={addCustom}>
            Add
          </button>
        </div>
        {tags.length ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">
                {t}
                <button type="button" className="text-slate-500 hover:text-rose-600" onClick={() => setTags(tags.filter((x) => x !== t))}>
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg border border-brand-200 bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50 dark:border-brand-500"
          disabled={busy || !name.trim()}
          onClick={() =>
            onSave({
              name: name.trim(),
              company: company.trim() || null,
              phone: phone.trim() || null,
              email: email.trim() || null,
              address: address.trim() || null,
              notes: notes.trim() || null,
              tags
            })
          }
        >
          {isNew ? "Create contact" : "Save changes"}
        </button>
        {onCancel ? (
          <button type="button" className="ui-btn-outline" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ActivityPanel({ detail, meetings, onAdd, onDelete, busy }) {
  const [type, setType] = useState("NOTE");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [meetingId, setMeetingId] = useState("");

  const rows = detail?.interactions ?? [];

  return (
    <div className="space-y-4">
      <div className="ui-surface rounded-2xl p-4">
        <SectionTitle icon={IconBolt}>Log interaction</SectionTitle>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Type
            <select className="ui-select mt-1 w-full" value={type} onChange={(e) => setType(e.target.value)}>
              {INTERACTION_TYPES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Link meeting (optional)
            <select className="ui-select mt-1 w-full" value={meetingId} onChange={(e) => setMeetingId(e.target.value)}>
              <option value="">—</option>
              {meetings.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title} · {m.date}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="mt-2 block text-sm">
          Title
          <input className="ui-input mt-1 w-full" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="mt-2 block text-sm">
          Notes
          <textarea className="ui-textarea mt-1 w-full" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <button
          type="button"
          className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={busy}
          onClick={() => {
            const payload = {
              type,
              title: title.trim() || null,
              notes: notes.trim() || null,
              meetingId: meetingId ? Number(meetingId) : null
            };
            onAdd(payload);
            setTitle("");
            setNotes("");
            setMeetingId("");
          }}
        >
          Add entry
        </button>
      </div>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="ui-surface flex flex-wrap items-start justify-between gap-2 rounded-xl p-3">
            <div>
              <div className="text-xs font-semibold uppercase text-brand-700 dark:text-brand-300">{r.type}</div>
              <div className="font-medium text-slate-900 dark:text-slate-50">{r.title || "—"}</div>
              {r.notes ? <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{r.notes}</p> : null}
              <div className="mt-1 text-[11px] text-slate-500">{new Date(r.occurredAt).toLocaleString()}</div>
              {r.meeting ? (
                <Link className="mt-1 inline-block text-sm font-medium text-brand-700 hover:underline dark:text-brand-300" to="/meetings">
                  Meeting: {r.meeting.title} ({r.meeting.date})
                </Link>
              ) : null}
            </div>
            <button type="button" className="ui-btn-outline-xs text-rose-700" onClick={() => onDelete(r.id)}>
              Remove
            </button>
          </li>
        ))}
        {!rows.length ? <li className="text-sm text-slate-500">No interactions yet.</li> : null}
      </ul>
    </div>
  );
}

function DocumentsPanel({ detail, allDocs, onLink, onUnlink, busy }) {
  const [docId, setDocId] = useState("");
  const [note, setNote] = useState("");
  const links = detail?.documentLinks ?? [];
  const linkedIds = new Set(links.map((l) => l.documentId));
  const available = allDocs.filter((d) => !linkedIds.has(d.id));

  return (
    <div className="space-y-4">
      <div className="ui-surface rounded-2xl p-4">
        <SectionTitle icon={IconClipboard}>Link document</SectionTitle>
        <p className="mt-1 text-xs text-slate-500">Choose from the organisation document register (same library as Documents).</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <select className="ui-select min-w-[200px] flex-1" value={docId} onChange={(e) => setDocId(e.target.value)}>
            <option value="">Select document…</option>
            {available.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title} (#{d.id})
              </option>
            ))}
          </select>
          <input className="ui-input flex-1" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button
            type="button"
            className="ui-btn-outline"
            disabled={busy || !docId}
            onClick={() => {
              onLink({ documentId: Number(docId), note: note.trim() || null });
              setDocId("");
              setNote("");
            }}
          >
            Link
          </button>
        </div>
      </div>
      <ul className="space-y-2">
        {links.map((l) => (
          <li key={l.id} className="ui-surface flex flex-wrap items-center justify-between gap-2 rounded-xl p-3">
            <div>
              <div className="font-medium text-slate-900 dark:text-slate-50">{l.document?.title || `Document #${l.documentId}`}</div>
              {l.note ? <div className="text-sm text-slate-600">{l.note}</div> : null}
              <Link className="text-sm text-brand-700 hover:underline dark:text-brand-300" to="/documents">
                Open in Documents →
              </Link>
            </div>
            <button type="button" className="ui-btn-outline-xs text-rose-700" onClick={() => onUnlink(l.id)}>
              Unlink
            </button>
          </li>
        ))}
        {!links.length ? <li className="text-sm text-slate-500">No linked documents.</li> : null}
      </ul>
    </div>
  );
}

function RemindersPanel({ detail, onAdd, onToggle, onDelete, busy }) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [due, setDue] = useState("");
  const rows = detail?.reminders ?? [];

  return (
    <div className="space-y-4">
      <div className="ui-surface rounded-2xl p-4">
        <SectionTitle icon={IconCalendar}>New reminder</SectionTitle>
        <label className="mt-2 block text-sm">
          Title *
          <input className="ui-input mt-1 w-full" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="mt-2 block text-sm">
          Due *
          <input className="ui-input mt-1 w-full" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        <label className="mt-2 block text-sm">
          Notes
          <textarea className="ui-textarea mt-1 w-full" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <button
          type="button"
          className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={busy || !title.trim() || !due}
          onClick={() => {
            const iso = new Date(due);
            if (Number.isNaN(iso.getTime())) return;
            onAdd({ title: title.trim(), notes: notes.trim() || null, dueAt: iso.toISOString() });
            setTitle("");
            setNotes("");
            setDue("");
          }}
        >
          Add reminder
        </button>
      </div>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="ui-surface flex flex-wrap items-center justify-between gap-2 rounded-xl p-3">
            <div>
              <div className={["font-medium", r.done ? "text-slate-400 line-through" : "text-slate-900 dark:text-slate-50"].join(" ")}>{r.title}</div>
              <div className="text-sm text-slate-500">Due {new Date(r.dueAt).toLocaleString()}</div>
              {r.notes ? <p className="mt-1 text-sm text-slate-600">{r.notes}</p> : null}
            </div>
            <div className="flex gap-2">
              <button type="button" className="ui-btn-outline-xs" onClick={() => onToggle(r.id, !r.done)}>
                {r.done ? "Undo" : "Done"}
              </button>
              <button type="button" className="ui-btn-outline-xs text-rose-700" onClick={() => onDelete(r.id)}>
                Delete
              </button>
            </div>
          </li>
        ))}
        {!rows.length ? <li className="text-sm text-slate-500">No reminders.</li> : null}
      </ul>
    </div>
  );
}

function MeetingsPanel({ detail }) {
  const ix = detail?.interactions?.filter((i) => i.meetingId && i.meeting) ?? [];
  return (
    <div className="ui-surface rounded-2xl p-4">
      <SectionTitle icon={IconCalendar}>Meeting history</SectionTitle>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Meetings linked from the Interactions tab appear here.</p>
      <ul className="mt-4 space-y-3">
        {ix.map((i) => (
          <li key={i.id} className="rounded-xl border border-slate-200/80 p-3 dark:border-slate-700">
            <div className="font-semibold text-slate-900 dark:text-white">{i.meeting.title}</div>
            <div className="text-sm text-slate-500">
              {i.meeting.date} {i.meeting.time ? `· ${i.meeting.time}` : ""} · {i.meeting.status}
            </div>
            <div className="mt-1 text-xs text-slate-400">Logged {new Date(i.occurredAt).toLocaleString()}</div>
          </li>
        ))}
        {!ix.length ? <li className="text-sm text-slate-500">No linked meetings yet. Add an interaction with a meeting.</li> : null}
      </ul>
    </div>
  );
}
