import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import { useCirculation } from "../hooks/useCirculation";
import { listDirectors } from "../api/directors";
import { createCirculation, updateCirculation } from "../api/circulation";
import { fmtDate } from "../lib/format";

export default function CirculationRounds() {
  const qc = useQueryClient();
  const q = useCirculation();
  const qDirs = useQuery({ queryKey: ["directors"], queryFn: listDirectors });

  const [round, setRound] = useState("");
  const [position, setPosition] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [amountPerMember, setAmountPerMember] = useState("");
  const [totalCollected, setTotalCollected] = useState("");
  const [notes, setNotes] = useState("");

  const mCreate = useMutation({
    mutationFn: (payload) => createCirculation(payload),
    onSuccess: async () => {
      setRound("");
      setPosition("");
      setStartDate("");
      setEndDate("");
      setRecipientId("");
      setAmountPerMember("");
      setTotalCollected("");
      setNotes("");
      await qc.invalidateQueries({ queryKey: ["circulation"] });
    }
  });

  const mToggle = useMutation({
    mutationFn: ({ id, approved }) => updateCirculation(id, { approved }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["circulation"] });
    }
  });

  if (q.isLoading) return <Loading label="Loading circulation rounds..." />;
  if (q.error) return <ErrorBanner error={q.error} />;

  const rounds = q.data || [];

  return (
    <div className="space-y-4">
      <div>
        <div className="text-lg font-semibold text-slate-900">Circulation Rounds</div>
        <div className="text-sm text-slate-600">Historical record of circulation rounds.</div>
      </div>

      {mCreate.error ? <ErrorBanner error={mCreate.error} /> : null}
      {mToggle.error ? <ErrorBanner error={mToggle.error} /> : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          mCreate.mutate({
            round: Number(round),
            position: Number(position),
            startDate: new Date(`${startDate}T00:00:00.000Z`).toISOString(),
            endDate: new Date(`${endDate}T00:00:00.000Z`).toISOString(),
            recipientId: Number(recipientId),
            amountPerMember: Number(amountPerMember || 0),
            totalCollected: totalCollected ? Number(totalCollected) : undefined,
            notes: notes || undefined
          });
        }}
        className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <div className="text-xs font-medium text-slate-700">Round</div>
            <input className="mt-1 w-full rounded-lg border-slate-300" value={round} onChange={(e) => setRound(e.target.value)} required />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-700">Position</div>
            <input className="mt-1 w-full rounded-lg border-slate-300" value={position} onChange={(e) => setPosition(e.target.value)} required />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-700">Recipient</div>
            <select className="mt-1 w-full rounded-lg border-slate-300" value={recipientId} onChange={(e) => setRecipientId(e.target.value)} required>
              <option value="">Select...</option>
              {(qDirs.data || []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-700">Start date</div>
            <input className="mt-1 w-full rounded-lg border-slate-300" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-700">End date</div>
            <input className="mt-1 w-full rounded-lg border-slate-300" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-700">Per-member amount (€)</div>
            <input className="mt-1 w-full rounded-lg border-slate-300" inputMode="decimal" value={amountPerMember} onChange={(e) => setAmountPerMember(e.target.value)} required />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-700">Total collected (€)</div>
            <input className="mt-1 w-full rounded-lg border-slate-300" inputMode="decimal" value={totalCollected} onChange={(e) => setTotalCollected(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <div className="text-xs font-medium text-slate-700">Notes</div>
            <input className="mt-1 w-full rounded-lg border-slate-300" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <button disabled={mCreate.isPending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
          {mCreate.isPending ? "Saving..." : "Add round entry"}
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-4 py-3">Round</th>
              <th className="px-4 py-3">Pos</th>
              <th className="px-4 py-3">Start</th>
              <th className="px-4 py-3">End</th>
              <th className="px-4 py-3">Recipient</th>
              <th className="px-4 py-3">Approved</th>
              <th className="px-4 py-3 text-right">Per-member</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rounds.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">{r.round}</td>
                <td className="px-4 py-3">{r.position}</td>
                <td className="px-4 py-3">{fmtDate(r.startDate)}</td>
                <td className="px-4 py-3">{fmtDate(r.endDate)}</td>
                <td className="px-4 py-3">{r.recipient?.name || r.recipientId}</td>
                <td className="px-4 py-3">
                  <button
                    disabled={mToggle.isPending}
                    className={[
                      "rounded-full px-3 py-1 text-xs font-semibold",
                      r.approved ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"
                    ].join(" ")}
                    onClick={() => mToggle.mutate({ id: r.id, approved: !r.approved })}
                  >
                    {r.approved ? "Approved" : "Not approved"}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">{r.amountPerMember}</td>
                <td className="px-4 py-3 text-right">{r.totalCollected ?? "—"}</td>
              </tr>
            ))}
            {rounds.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-slate-500" colSpan={8}>
                  No circulation rounds yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

