export const PROJECT_KIND = {
  GENERAL: "General",
  MMF: "Money market (MMF)",
  YPA: "YPA (Goats)"
};

export const PROJECT_STATUS = {
  PLANNING: "Planning",
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled"
};

export const PRIORITY = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical"
};

export const TASK_STATUS = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  REVIEW: "Review",
  DONE: "Done",
  BLOCKED: "Blocked"
};

export function statusBadgeClass(status) {
  const map = {
    PLANNING: "bg-slate-100 text-slate-800",
    ACTIVE: "bg-emerald-50 text-emerald-800",
    ON_HOLD: "bg-amber-50 text-amber-900",
    COMPLETED: "bg-blue-50 text-blue-800",
    CANCELLED: "bg-rose-50 text-rose-800",
    TODO: "bg-slate-100 text-slate-700",
    IN_PROGRESS: "bg-sky-50 text-sky-900",
    REVIEW: "bg-violet-50 text-violet-800",
    DONE: "bg-emerald-50 text-emerald-800",
    BLOCKED: "bg-rose-50 text-rose-800"
  };
  return map[status] || "bg-slate-100 text-slate-700";
}

export function priorityBadgeClass(p) {
  const map = {
    LOW: "bg-slate-100 text-slate-600",
    MEDIUM: "bg-amber-50 text-amber-900",
    HIGH: "bg-orange-50 text-orange-900",
    CRITICAL: "bg-rose-100 text-rose-900"
  };
  return map[p] || "bg-slate-100 text-slate-600";
}
