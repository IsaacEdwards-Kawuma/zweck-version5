import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/http.js";
import { requireRole } from "../middleware/auth.js";
import { buildDirectorReceiptPdfBuffer } from "../lib/directorReceiptPdf.js";
import { canViewDirectorFinancials, toDirectorPublic } from "../lib/directorVisibility.js";

const router = Router();

router.get("/", requireRole("DIRECTOR"), async (req, res) => {
  const directorId = Number(req.query.directorId);
  if (!Number.isFinite(directorId)) return res.status(400).json(apiError("Invalid directorId"));
  const viewer = { role: req.user!.role, directorId: req.user!.directorId ?? null };
  if (!canViewDirectorFinancials(viewer, directorId)) return res.status(403).json(apiError("Forbidden"));
  const rows = await prisma.directorReceipt.findMany({
    where: { directorId, deletedAt: null },
    orderBy: { transactionDate: "desc" },
    select: {
      id: true,
      directorId: true,
      receiptReference: true,
      periodMonth: true,
      transactionDate: true,
      meta: true,
      pdfUrl: true,
      pdfStatus: true,
      createdAt: true
    }
  });
  return res.json(rows);
});

router.get("/:id/pdf", requireRole("DIRECTOR"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid receipt id"));

  const receipt = await prisma.directorReceipt.findUnique({
    where: { id },
    include: {
      director: true,
      transactionBatch: {
        include: {
          transactions: { orderBy: { id: "asc" } },
          lines: { orderBy: { id: "asc" } }
        }
      }
    }
  });
  if (!receipt || receipt.deletedAt) return res.status(404).json(apiError("Receipt not found"));

  const viewer = { role: req.user!.role, directorId: req.user!.directorId ?? null };
  if (!canViewDirectorFinancials(viewer, receipt.directorId)) {
    return res.status(403).json(apiError("Forbidden"));
  }
  const directorPublic = toDirectorPublic(receipt.director, viewer);

  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  const companyName = settings?.companyName || "Zweck Co. Ltd";

  const postedByUser =
    receipt.transactionBatch.createdBy != null
      ? await prisma.user.findUnique({
          where: { id: receipt.transactionBatch.createdBy },
          select: { email: true, director: { select: { name: true } } }
        })
      : null;
  const postedBy = postedByUser?.director?.name || postedByUser?.email || "System";

  const buffer = await buildDirectorReceiptPdfBuffer({
    receipt,
    transactionBatch: receipt.transactionBatch,
    companyName,
    director: {
      id: receipt.director.id,
      name: receipt.director.name,
      email: directorPublic.email ?? null,
      phone: directorPublic.phone ?? null,
      address: directorPublic.address ?? null
    },
    postedBy
  });

  const safeName = `director-receipt-${receipt.receiptReference}`.replace(/[^a-zA-Z0-9._-]/g, "_");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${safeName}.pdf"`);
  return res.send(buffer);
});

export default router;

