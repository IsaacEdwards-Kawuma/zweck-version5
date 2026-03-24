import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/http.js";

const router = Router();

/** Cross-entity search (directors, meetings, document register). */
router.get("/", async (req, res) => {
  const raw = String(req.query.q ?? "").trim();
  if (raw.length < 2) {
    return res.status(400).json(apiError("Query must be at least 2 characters", "q"));
  }
  const q = raw.slice(0, 120);

  const [directors, meetings, documents] = await Promise.all([
    prisma.director.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { initials: { contains: q, mode: "insensitive" } }
        ]
      },
      take: 12,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        initials: true,
        active: true,
        occupation: true
      }
    }),
    prisma.meeting.findMany({
      where: {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { location: { contains: q, mode: "insensitive" } },
          { chairperson: { contains: q, mode: "insensitive" } }
        ]
      },
      take: 12,
      orderBy: [{ date: "desc" }, { id: "desc" }],
      select: { id: true, title: true, date: true, status: true, meetingType: true }
    }),
    prisma.documentRegister.findMany({
      where: {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { reference: { contains: q, mode: "insensitive" } },
          { tags: { contains: q, mode: "insensitive" } }
        ]
      },
      take: 12,
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, category: true, status: true, reference: true }
    })
  ]);

  return res.json({ query: q, directors, meetings, documents });
});

export default router;
