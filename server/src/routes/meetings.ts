import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/http.js";
import { requireRole } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { notifyUser } from "../services/inAppNotifications.js";

const router = Router();
const db: any = prisma;

const meetingSchema = z.object({
  title: z.string().min(1).max(300),
  date: z.string().min(1).max(20),
  time: z.string().max(20).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  chairperson: z.string().max(200).optional().nullable(),
  attendees: z.string().max(4000).optional().nullable(),
  attendanceCount: z.number().int().nonnegative().optional().nullable(),
  expectedAttendees: z.number().int().nonnegative().optional().nullable(),
  meetingType: z.string().max(80).optional().nullable(),
  priority: z.string().max(40).optional().nullable(),
  recurrence: z.string().max(40).optional().nullable(),
  reminderDays: z.number().int().nonnegative().optional().nullable(),
  agenda: z.string().max(10000).optional().nullable(),
  actionItems: z.string().max(10000).optional().nullable(),
  notes: z.string().max(15000).optional().nullable(),
  nextMeetingDate: z.string().max(20).optional().nullable(),
  status: z.string().max(40).optional().nullable()
});

const updateMeetingSchema = meetingSchema.partial();

const createMeetingSchema = meetingSchema.extend({
  inviteUserIds: z.array(z.number().int().positive()).max(500).optional()
});

function isDirectorAccount(u: { role: string; directorId: number | null }): boolean {
  return u.role === "DIRECTOR" || u.directorId != null;
}

function meetingInviteBody(row: {
  date: string;
  time?: string | null;
  location?: string | null;
}): string {
  const when = [row.date, row.time].filter(Boolean).join(" · ");
  const parts = [`When: ${when}`];
  if (row.location) parts.push(`Location: ${row.location}`);
  return parts.join("\n");
}

/** Validates ids exist; Board meetings may only include director-linked accounts. */
async function resolveInviteUserIds(
  meetingType: string | null | undefined,
  rawIds: number[] | undefined
): Promise<number[]> {
  if (!rawIds?.length) return [];
  const unique = [...new Set(rawIds)];
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, role: true, directorId: true }
  });
  if (users.length !== unique.length) {
    throw new Error("INVALID_INVITE_USER");
  }
  const board = String(meetingType || "").trim().toLowerCase() === "board";
  if (board) {
    const bad = users.filter((u) => !isDirectorAccount(u));
    if (bad.length) throw new Error("BOARD_INVITE_NON_DIRECTOR");
  }
  return unique;
}

router.get("/", async (_req, res) => {
  const rows = await db.meeting.findMany({ orderBy: [{ date: "desc" }, { id: "desc" }] });
  res.json(rows);
});

function escapeIcsText(s: string) {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function icsDateOnly(yyyyMmDd: string) {
  const d = String(yyyyMmDd || "").replace(/\D/g, "");
  return d.length >= 8 ? d.slice(0, 8) : "";
}

/** Subscribe in Outlook / Google Calendar — excludes cancelled meetings. */
router.get("/calendar.ics", async (_req, res) => {
  const rows = await db.meeting.findMany({ orderBy: [{ date: "asc" }, { id: "asc" }] });
  const active = rows.filter((r: { status?: string | null }) => r.status !== "CANCELLED");
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ZweckOS//Meetings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH"
  ];
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  for (const m of active) {
    const day = icsDateOnly(m.date);
    if (!day) continue;
    const uid = `meeting-${m.id}@zweckos`;
    const loc = m.location ? escapeIcsText(m.location) : "";
    const desc = [m.agenda, m.notes, m.actionItems].filter(Boolean).join("\\n\\n");
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART;VALUE=DATE:${day}`);
    lines.push(`SUMMARY:${escapeIcsText(m.title || "Meeting")}`);
    if (loc) lines.push(`LOCATION:${loc}`);
    if (desc) lines.push(`DESCRIPTION:${escapeIcsText(desc)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="zweck-meetings.ics"');
  return res.send(lines.join("\r\n"));
});

router.post("/", requireRole("ADMIN"), validateBody(createMeetingSchema), async (req, res) => {
  const body = req.body as z.infer<typeof createMeetingSchema>;
  const { inviteUserIds, ...meetingFields } = body;
  let inviteIds: number[] = [];
  try {
    inviteIds = await resolveInviteUserIds(meetingFields.meetingType, inviteUserIds);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "INVALID_INVITE_USER") {
      return res.status(400).json(apiError("One or more selected attendees are invalid."));
    }
    if (msg === "BOARD_INVITE_NON_DIRECTOR") {
      return res.status(400).json(apiError("Board meetings can only invite director accounts."));
    }
    throw e;
  }
  const uid = req.user?.id ?? null;
  const row = await db.meeting.create({
    data: {
      ...meetingFields,
      createdById: uid,
      updatedById: uid
    }
  });
  await db.auditLog.create({
    data: {
      userId: req.user?.id ?? 0,
      action: "CREATE_MEETING",
      entityType: "Meeting",
      entityId: row.id,
      before: null,
      after: row as any
    }
  });
  const creatorId = req.user?.id ?? null;
  const bodyText = meetingInviteBody(row);
  for (const inviteeId of inviteIds) {
    if (creatorId != null && inviteeId === creatorId) continue;
    await notifyUser(
      inviteeId,
      "MEETING_INVITE",
      `Invitation: ${row.title}`,
      bodyText,
      "/meetings",
      row.id
    );
  }
  return res.status(201).json(row);
});

router.put("/:id", requireRole("ADMIN"), validateBody(updateMeetingSchema), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid meeting id"));
  const body = req.body as z.infer<typeof updateMeetingSchema>;
  try {
    const before = await db.meeting.findUnique({ where: { id } });
    const row = await db.meeting.update({
      where: { id },
      data: { ...body, updatedById: req.user?.id ?? null }
    });
    await db.auditLog.create({
      data: {
        userId: req.user?.id ?? 0,
        action: "UPDATE_MEETING",
        entityType: "Meeting",
        entityId: row.id,
        before: before as any,
        after: row as any
      }
    });
    return res.json(row);
  } catch {
    return res.status(404).json(apiError("Meeting not found"));
  }
});

router.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid meeting id"));
  try {
    const before = await db.meeting.findUnique({ where: { id } });
    await db.meeting.delete({ where: { id } });
    await db.auditLog.create({
      data: {
        userId: req.user?.id ?? 0,
        action: "DELETE_MEETING",
        entityType: "Meeting",
        entityId: id,
        before: before as any,
        after: null
      }
    });
    return res.status(204).send();
  } catch {
    return res.status(404).json(apiError("Meeting not found"));
  }
});

export default router;
