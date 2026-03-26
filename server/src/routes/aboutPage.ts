import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/http.js";
import { requireRole } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";

const router = Router();
const db: typeof prisma = prisma;

const ABOUT_ID = 1;

export const aboutPayloadSchema = z.object({
  headerProductName: z.string().min(1).max(120),
  headerCompanyName: z.string().min(1).max(200),
  headerLocation: z.string().min(1).max(200),
  preparedByLabel: z.string().min(1).max(160),
  authorisedByLabel: z.string().min(1).max(160),
  introParagraphs: z.array(z.string().max(8000)).min(1).max(12),
  featuresSectionTitle: z.string().min(1).max(200),
  featureBullets: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        body: z.string().max(4000)
      })
    )
    .min(1)
    .max(30),
  contactSectionTitle: z.string().min(1).max(200),
  contactBlurb: z.string().max(12000),
  directorsSectionTitle: z.string().min(1).max(200),
  directorsSectionIntro: z.string().max(4000)
});

export type AboutPayload = z.infer<typeof aboutPayloadSchema>;

export function defaultAboutPayload(): AboutPayload {
  return {
    headerProductName: "ZweckOS",
    headerCompanyName: "Zweck Tukula Co. Ltd",
    headerLocation: "Kampala, Uganda",
    preparedByLabel: "Director Signature:",
    authorisedByLabel: "Authorised - Treasurer:",
    introParagraphs: [
      "Zweck Tukula Co. Ltd is a member-driven company built around transparent governance, shared financial discipline, and long-term portfolio growth. ZweckOS is our internal platform to run the business: one place for meetings, documents, accounting, reporting, and project work.",
      "The system reflects how we operate: clear roles, traceable decisions, and up-to-date figures everyone can rely on for board discussions and day-to-day management."
    ],
    featuresSectionTitle: "What you can do in ZweckOS",
    featureBullets: [
      {
        title: "Finance & reporting",
        body: "Post transactions, review the ledger, reconcile balances, and export reports for review periods."
      },
      {
        title: "Governance",
        body: "Schedule and track meetings, store resolutions and supporting documents, and keep an audit trail of important actions."
      },
      {
        title: "Members & portfolio",
        body: "Maintain director profiles, monitor contributions and holdings, and follow projects in one workspace."
      }
    ],
    contactSectionTitle: "Contact & support",
    contactBlurb:
      "For operational questions, access issues, or changes to your profile, reach out to your administrator or company leadership. Sensitive updates (roles, postings, legal documents) follow the approvals your board has defined outside the app as well as inside it.",
    directorsSectionTitle: "Directors & members",
    directorsSectionIntro:
      "Short profiles of active members. Open a profile for full detail, balances, and history."
  };
}

function parseStoredPayload(raw: unknown): AboutPayload | null {
  const r = aboutPayloadSchema.safeParse(raw);
  return r.success ? r.data : null;
}

router.get("/", async (_req, res) => {
  const row = await db.aboutPage.findUnique({ where: { id: ABOUT_ID } });
  const parsed = row?.payload != null ? parseStoredPayload(row.payload) : null;
  const payload = parsed ?? defaultAboutPayload();
  res.json({
    payload,
    isCustom: Boolean(row)
  });
});

router.put("/", requireRole("ADMIN"), validateBody(aboutPayloadSchema), async (req, res) => {
  const body = req.body as AboutPayload;
  const row = await db.aboutPage.upsert({
    where: { id: ABOUT_ID },
    create: { id: ABOUT_ID, payload: body as object },
    update: { payload: body as object }
  });
  const parsed = parseStoredPayload(row.payload);
  if (!parsed) {
    return res.status(500).json(apiError("Stored About page payload is invalid"));
  }
  res.json({ payload: parsed, isCustom: true });
});

router.delete("/", requireRole("ADMIN"), async (_req, res) => {
  await db.aboutPage.deleteMany({ where: { id: ABOUT_ID } });
  res.json({ ok: true, payload: defaultAboutPayload(), isCustom: false });
});

export default router;
