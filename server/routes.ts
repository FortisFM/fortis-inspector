import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "node:http";
import express from "express";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import multer from "multer";
import sharp from "sharp";
import { storage, seedAdmin } from "./storage";
import { insertSiteSchema, insertChecklistItemSchema, loginSchema, severityRank } from "@shared/schema";
import type { InspectionEntry } from "@shared/schema";
import { buildReportHtml, footerTemplate, headerTemplate } from "./report";
import { aiEnabled, analysePhoto, polishNote, executiveSummary } from "./ai";
import { buildAnalytics, type RangeKey } from "./analytics";
import { csvBuffer, xlsxBuffer } from "./export";
import { configurePush, pushEnabled, publicKey, pushAdmins, pushToAll } from "./push";

import { UPLOAD_DIR, PDF_DIR, ensureDirs } from "./paths";
ensureDirs();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// ---- Persisted token auth. Tokens live in the sessions table so logins
// survive server restarts and Railway redeploys.
function issueToken(userId: number): string {
  const t = crypto.randomBytes(24).toString("hex");
  storage.createSession(userId, t);
  return t;
}
function authUser(req: Request) {
  const header = req.headers["authorization"];
  const token = typeof header === "string" ? header.replace(/^Bearer\s+/i, "") : "";
  if (!token) return undefined;
  const userId = storage.getSessionUserId(token);
  if (!userId) return undefined;
  return storage.getUser(userId);
}
// Purge expired sessions every hour. Cheap, single SQL DELETE.
setInterval(() => storage.purgeExpiredSessions(), 60 * 60 * 1000).unref();
function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = authUser(req);
  if (!user) return res.status(401).json({ message: "Unauthorized" });
  (req as any).user = user;
  next();
}

// Auto-create / sync issues from an inspection's entries
function syncIssues(inspectionId: number) {
  const inspection = storage.getInspection(inspectionId);
  if (!inspection) return;
  const entries = storage.listEntries(inspectionId);
  for (const e of entries) {
    const qualifies =
      (e.status === "fail" || e.isObservation) &&
      e.severity != null &&
      severityRank[e.severity] >= severityRank["minor"];
    const existing = storage.getIssueByEntry(e.id);
    if (qualifies && !existing) {
      storage.createIssue(e.id, inspection.siteId, inspectionId);
    }
  }
}

// Generate and store an AI executive summary for a submitted inspection.
// Skips silently when AI is not configured.
async function buildExecutiveSummary(inspectionId: number) {
  if (!aiEnabled()) return;
  const inspection = storage.getInspection(inspectionId);
  if (!inspection) return;
  const site = storage.getSite(inspection.siteId);
  const entries = storage.listEntries(inspectionId);
  const counts = {
    pass: entries.filter((e) => e.status === "pass").length,
    fail: entries.filter((e) => e.status === "fail").length,
    na: entries.filter((e) => e.status === "na").length,
    observations: entries.filter((e) => e.isObservation).length,
  };
  const flagged = entries
    .filter((e) => (e.status === "fail" || e.isObservation) && e.severity)
    .map((e) => ({ label: e.label || "Observation", severity: e.severity || "info" }));
  try {
    const summary = await executiveSummary({
      siteName: site?.name || "",
      date: new Date(inspection.submittedAt || inspection.startedAt).toLocaleDateString("en-AU"),
      inspector: inspection.inspectorName,
      weather: inspection.weather,
      counts,
      flagged,
    });
    if (summary) storage.updateInspection(inspectionId, { executiveSummary: summary });
  } catch (err) {
    console.error("Executive summary failed:", (err as Error).message);
  }
}

// Advance a site's next due date by its frequency from the submission date.
function advanceNextDue(siteId: number, fromMs: number) {
  const site = storage.getSite(siteId);
  if (!site || !site.inspectionFrequencyDays) return;
  const next = new Date(fromMs + site.inspectionFrequencyDays * 86400000)
    .toISOString()
    .slice(0, 10);
  storage.updateSite(siteId, { nextDueDate: next });
}

async function generatePdf(inspectionId: number): Promise<string> {
  const html = buildReportHtml(inspectionId);
  const inspection = storage.getInspection(inspectionId)!;
  const site = storage.getSite(inspection.siteId)!;
  const slug = site.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const dateStr = new Date(inspection.submittedAt || inspection.startedAt).toISOString().slice(0, 10);
  const fileName = `fortis-fm-inspection-${slug}-${dateStr}.pdf`;
  const outPath = path.resolve(PDF_DIR, `inspection-${inspectionId}.pdf`);

  const puppeteer = (await import("puppeteer")).default;
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.pdf({
      path: outPath,
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: headerTemplate(),
      footerTemplate: footerTemplate(),
      margin: { top: "96px", bottom: "64px", left: "0px", right: "0px" },
    });
  } finally {
    await browser.close();
  }
  storage.updateInspection(inspectionId, { pdfPath: `inspection-${inspectionId}.pdf` });
  return fileName;
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  seedAdmin();
  if (aiEnabled()) {
    console.log("[ai] AI features enabled (ANTHROPIC_API_KEY found)");
  } else {
    console.log("[ai] AI features disabled (no ANTHROPIC_API_KEY)");
  }

  // Serve uploaded photos
  app.use("/uploads", express.static(UPLOAD_DIR));

  // ---------------- Auth ----------------
  app.post("/api/login", (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input" });
    const user = storage.getUserByEmail(parsed.data.email);
    if (!user || !storage.verifyPassword(user, parsed.data.password)) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    const token = issueToken(user.id);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  });

  app.get("/api/me", requireAuth, (req, res) => {
    const u = (req as any).user;
    res.json({ id: u.id, email: u.email, name: u.name });
  });

  app.post("/api/logout", requireAuth, (req, res) => {
    const header = req.headers["authorization"] as string;
    const token = header?.replace(/^Bearer\s+/i, "");
    if (token) storage.deleteSession(token);
    res.json({ ok: true });
  });

  // ---------------- Sites ----------------
  app.get("/api/sites", requireAuth, (_req, res) => {
    const sites = storage.listSites().map((s) => {
      const inspections = storage.listInspections(s.id);
      const openIssues = storage
        .listIssuesForSite(s.id)
        .filter((i) => i.status !== "resolved").length;
      return {
        ...s,
        checklistCount: storage.listChecklistItems(s.id).length,
        inspectionCount: inspections.filter((i) => i.status === "submitted").length,
        openIssues,
      };
    });
    res.json(sites);
  });

  app.get("/api/sites/:id", requireAuth, (req, res) => {
    const site = storage.getSite(Number(req.params.id));
    if (!site) return res.status(404).json({ message: "Not found" });
    res.json(site);
  });

  app.post("/api/sites", requireAuth, (req, res) => {
    const parsed = insertSiteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message });
    const data: any = { ...parsed.data };
    // Calculate the first due date from today when a frequency is set.
    if (data.inspectionFrequencyDays && !data.nextDueDate) {
      data.nextDueDate = new Date(Date.now() + data.inspectionFrequencyDays * 86400000)
        .toISOString()
        .slice(0, 10);
    }
    res.json(storage.createSite(data));
  });

  app.patch("/api/sites/:id", requireAuth, (req, res) => {
    const parsed = insertSiteSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input" });
    const data: any = { ...parsed.data };
    // When frequency changes, recalculate the next due date from today.
    if (Object.prototype.hasOwnProperty.call(data, "inspectionFrequencyDays")) {
      data.nextDueDate = data.inspectionFrequencyDays
        ? new Date(Date.now() + data.inspectionFrequencyDays * 86400000).toISOString().slice(0, 10)
        : null;
    }
    res.json(storage.updateSite(Number(req.params.id), data));
  });

  app.delete("/api/sites/:id", requireAuth, (req, res) => {
    storage.deleteSite(Number(req.params.id));
    res.json({ ok: true });
  });

  // ---------------- Checklist Items ----------------
  app.get("/api/sites/:id/checklist", requireAuth, (req, res) => {
    res.json(storage.listChecklistItems(Number(req.params.id)));
  });

  app.post("/api/sites/:id/checklist", requireAuth, (req, res) => {
    const parsed = insertChecklistItemSchema.safeParse({ ...req.body, siteId: Number(req.params.id) });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message });
    res.json(storage.createChecklistItem(parsed.data));
  });

  app.patch("/api/checklist/:id", requireAuth, (req, res) => {
    res.json(storage.updateChecklistItem(Number(req.params.id), req.body));
  });

  app.delete("/api/checklist/:id", requireAuth, (req, res) => {
    storage.deleteChecklistItem(Number(req.params.id));
    res.json({ ok: true });
  });

  app.post("/api/checklist/:id/move", requireAuth, (req, res) => {
    storage.moveChecklistItem(Number(req.params.id), req.body.direction === "up" ? "up" : "down");
    res.json({ ok: true });
  });

  app.post("/api/sites/:id/checklist/duplicate", requireAuth, (req, res) => {
    const fromSiteId = Number(req.body.fromSiteId);
    const count = storage.duplicateChecklist(fromSiteId, Number(req.params.id));
    res.json({ ok: true, count });
  });

  // ---------------- Inspections ----------------
  app.get("/api/sites/:id/inspections", requireAuth, (req, res) => {
    res.json(storage.listInspections(Number(req.params.id)));
  });

  app.post("/api/sites/:id/inspections", requireAuth, (req, res) => {
    const u = (req as any).user;
    const insp = storage.createInspection(Number(req.params.id), u.id, u.name);
    res.json(insp);
  });

  // Full inspection detail (with entries + photos)
  app.get("/api/inspections/:id", requireAuth, (req, res) => {
    const inspection = storage.getInspection(Number(req.params.id));
    if (!inspection) return res.status(404).json({ message: "Not found" });
    const site = storage.getSite(inspection.siteId);
    const entries = storage.listEntries(inspection.id).map((e) => ({
      ...e,
      photos: storage.listPhotos(e.id),
    }));
    res.json({ inspection, site, entries });
  });

  // Save draft / submit: replace entries wholesale, keep photos that were uploaded against temp entries
  // Client sends entries with optional `photoIds` (already-uploaded photo ids) to re-attach.
  app.post("/api/inspections/:id/save", requireAuth, async (req, res) => {
    const inspectionId = Number(req.params.id);
    const { entries, weather, generalNotes, inspectorName, status } = req.body as {
      entries: Array<Partial<InspectionEntry> & { photoIds?: number[] }>;
      weather?: string;
      generalNotes?: string;
      inspectorName?: string;
      status?: "draft" | "submitted";
    };

    storage.updateInspection(inspectionId, {
      weather: weather || "",
      generalNotes: generalNotes || "",
      inspectorName: inspectorName || (req as any).user.name,
      status: status === "submitted" ? "submitted" : "draft",
      submittedAt: status === "submitted" ? Date.now() : null,
    });

    const newEntries = storage.replaceEntries(
      inspectionId,
      entries.map((e, idx) => ({
        checklistItemId: e.checklistItemId ?? null,
        label: e.label || "",
        section: e.section || "",
        status: e.status || "na",
        note: e.note || "",
        severity: e.severity ?? null,
        sortOrder: idx,
        isObservation: !!e.isObservation,
      }))
    );

    // re-attach uploaded photos by index correspondence (look up each photo by id)
    entries.forEach((e, idx) => {
      const created = newEntries[idx];
      for (const pid of e.photoIds || []) {
        const orig = storage.getPhoto(pid);
        if (orig && created) {
          storage.addPhoto(created.id, orig.filePath, orig.caption);
        }
      }
    });

    if (status === "submitted") {
      syncIssues(inspectionId);
      const submittedAtMs = Date.now();
      // Executive summary runs before the PDF so the cover page can show it.
      await buildExecutiveSummary(inspectionId);
      const inspection = storage.getInspection(inspectionId);
      if (inspection) advanceNextDue(inspection.siteId, submittedAtMs);
      try {
        await generatePdf(inspectionId);
      } catch (err) {
        console.error("PDF generation failed:", err);
      }
      // Push the admin when a non admin staff member submits.
      const submitter = (req as any).user;
      const admin = storage.getUserByEmail("admin@fortisfm.com.au");
      if (submitter && admin && submitter.id !== admin.id) {
        const site = inspection ? storage.getSite(inspection.siteId) : undefined;
        pushAdmins({
          title: "Inspection submitted",
          body: `${submitter.name} submitted an inspection for ${site?.name || "a site"}.`,
          url: `/#/inspections/${inspectionId}`,
        }).catch(() => {});
      }
    }

    res.json({ ok: true, inspectionId });
  });

  // Autosave a draft. Lightweight PATCH that never generates issues or PDFs.
  app.patch("/api/inspections/:id", requireAuth, (req, res) => {
    const inspectionId = Number(req.params.id);
    const inspection = storage.getInspection(inspectionId);
    if (!inspection) return res.status(404).json({ message: "Not found" });
    if (inspection.status === "submitted") return res.json({ ok: true, skipped: true });
    const { entries, weather, generalNotes, inspectorName } = req.body as {
      entries?: Array<Partial<InspectionEntry> & { photoIds?: number[] }>;
      weather?: string;
      generalNotes?: string;
      inspectorName?: string;
    };
    storage.updateInspection(inspectionId, {
      weather: weather ?? inspection.weather,
      generalNotes: generalNotes ?? inspection.generalNotes,
      inspectorName: inspectorName ?? inspection.inspectorName,
      status: "draft",
    });
    if (Array.isArray(entries)) {
      const newEntries = storage.replaceEntries(
        inspectionId,
        entries.map((e, idx) => ({
          checklistItemId: e.checklistItemId ?? null,
          label: e.label || "",
          section: e.section || "",
          status: e.status || "na",
          note: e.note || "",
          severity: e.severity ?? null,
          sortOrder: idx,
          isObservation: !!e.isObservation,
        }))
      );
      entries.forEach((e, idx) => {
        const created = newEntries[idx];
        for (const pid of e.photoIds || []) {
          const orig = storage.getPhoto(pid);
          if (orig && created) storage.addPhoto(created.id, orig.filePath, orig.caption);
        }
      });
    }
    res.json({ ok: true, savedAt: Date.now() });
  });

  // Previous submitted inspection flagged items, for the compare panel.
  app.get("/api/sites/:id/previous-flagged", requireAuth, (req, res) => {
    const siteId = Number(req.params.id);
    const beforeId = req.query.before ? Number(req.query.before) : undefined;
    const prev = storage.lastSubmittedInspection(siteId, beforeId);
    if (!prev) return res.json({ inspection: null, items: [] });
    const items = storage
      .listEntries(prev.id)
      .filter((e) => e.status === "fail" || e.isObservation)
      .map((e) => {
        const issue = storage.getIssueByEntry(e.id);
        const photos = storage.listPhotos(e.id);
        return {
          entryId: e.id,
          label: e.label || "Observation",
          severity: e.severity,
          isObservation: e.isObservation,
          firstPhoto: photos[0]?.filePath || null,
          issueId: issue?.id || null,
          issueStatus: issue?.status || (e.status === "fail" || e.isObservation ? "open" : null),
        };
      });
    res.json({ inspection: prev, items });
  });

  app.delete("/api/inspections/:id", requireAuth, (req, res) => {
    storage.deleteInspection(Number(req.params.id));
    res.json({ ok: true });
  });

  // ---------------- Photo upload ----------------
  // Upload a photo standalone (returns photo id + path); client links it to an entry on save.
  app.post("/api/photos", requireAuth, upload.single("photo"), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file" });
    const fileName = `${crypto.randomBytes(10).toString("hex")}.jpg`;
    const outPath = path.resolve(UPLOAD_DIR, fileName);
    try {
      await sharp(req.file.buffer)
        .rotate()
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 78 })
        .toFile(outPath);
    } catch {
      fs.writeFileSync(outPath, req.file.buffer);
    }
    // create a detached photo row using a placeholder entry id of 0; we store path and return
    const photo = storage.addPhoto(0, fileName, "");
    // The client compresses and (optionally) annotates before upload, so mark accordingly.
    if (req.query.annotated === "1") storage.setPhotoAnnotated(photo.id, true);
    res.json({
      id: photo.id,
      filePath: fileName,
      url: `/uploads/${fileName}`,
      isAnnotated: req.query.annotated === "1",
    });
  });

  // ---------------- Report / PDF ----------------
  app.get("/api/inspections/:id/report.html", (req, res) => {
    const id = Number(req.params.id);
    if (!storage.getInspection(id)) return res.status(404).send("Not found");
    res.setHeader("Content-Type", "text/html");
    res.send(buildReportHtml(id));
  });

  app.get("/api/inspections/:id/pdf", async (req, res) => {
    const id = Number(req.params.id);
    const inspection = storage.getInspection(id);
    if (!inspection) return res.status(404).json({ message: "Not found" });
    const site = storage.getSite(inspection.siteId)!;
    const slug = site.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const dateStr = new Date(inspection.submittedAt || inspection.startedAt)
      .toISOString()
      .slice(0, 10);
    const fileName = `fortis-fm-inspection-${slug}-${dateStr}.pdf`;
    const filePath = path.resolve(PDF_DIR, `inspection-${id}.pdf`);
    try {
      if (!fs.existsSync(filePath)) await generatePdf(id);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      console.error("PDF error:", err);
      res.status(500).json({ message: "PDF generation failed. View the HTML report instead." });
    }
  });

  // ---------------- Issues ----------------
  app.get("/api/issues", requireAuth, (_req, res) => {
    const issues = storage.listIssues();
    const enriched = issues
      .map((issue) => {
        const entry = storage.getEntry(issue.entryId);
        const site = storage.getSite(issue.siteId);
        const inspection = storage.getInspection(issue.inspectionId);
        if (!entry || !site) return null;
        const photos = storage.listPhotos(entry.id);
        const inspectionDate = inspection?.submittedAt || inspection?.startedAt || Date.now();
        const ageDays = Math.floor((Date.now() - inspectionDate) / 86400000);
        return {
          ...issue,
          siteName: site.name,
          siteAddress: site.address,
          clientEmail: site.clientEmail,
          label: entry.label,
          section: entry.section,
          note: entry.note,
          severity: entry.severity,
          entryStatus: entry.status,
          isObservation: entry.isObservation,
          photos,
          inspectionDate,
          ageDays,
        };
      })
      .filter(Boolean);
    res.json(enriched);
  });

  app.get("/api/issues/:id", requireAuth, (req, res) => {
    const issue = storage.getIssue(Number(req.params.id));
    if (!issue) return res.status(404).json({ message: "Not found" });
    const entry = storage.getEntry(issue.entryId);
    const site = storage.getSite(issue.siteId);
    const inspection = storage.getInspection(issue.inspectionId);
    const photos = entry ? storage.listPhotos(entry.id) : [];
    const inspectionDate = inspection?.submittedAt || inspection?.startedAt || Date.now();
    res.json({
      ...issue,
      site,
      entry,
      photos,
      inspectionDate,
      ageDays: Math.floor((Date.now() - inspectionDate) / 86400000),
    });
  });

  app.patch("/api/issues/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const { status, resolutionNote, photoIds } = req.body as {
      status?: string;
      resolutionNote?: string;
      photoIds?: number[];
    };
    const issue = storage.getIssue(id);
    if (!issue) return res.status(404).json({ message: "Not found" });
    const update: any = {};
    if (status) update.status = status;
    if (resolutionNote !== undefined) update.resolutionNote = resolutionNote;
    if (status === "resolved") update.resolvedAt = Date.now();
    // attach follow-up photos to the underlying entry
    if (photoIds?.length) {
      for (const pid of photoIds) {
        const orig = storage.getPhoto(pid);
        if (orig) storage.addPhoto(issue.entryId, orig.filePath, "Resolution photo");
      }
    }
    res.json(storage.updateIssue(id, update));
  });

  // ---------------- Bulk issue actions ----------------
  app.post("/api/issues/bulk", requireAuth, (req, res) => {
    const { ids, action } = req.body as { ids: number[]; action: string };
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ message: "No issues selected" });
    const status = action === "resolve" ? "resolved" : action === "in_progress" ? "in_progress" : null;
    if (!status) return res.status(400).json({ message: "Unknown action" });
    for (const id of ids) {
      const update: any = { status };
      if (status === "resolved") update.resolvedAt = Date.now();
      storage.updateIssue(id, update);
    }
    res.json({ ok: true, count: ids.length });
  });

  // ---------------- AI features ----------------
  app.get("/api/ai/status", requireAuth, (_req, res) => {
    res.json({ enabled: aiEnabled() });
  });

  app.post("/api/ai/analyse-photo", requireAuth, async (req, res) => {
    if (!aiEnabled())
      return res.status(503).json({ message: "AI features require ANTHROPIC_API_KEY in the server environment" });
    const { photoUrl, itemLabel, siteName } = req.body as {
      photoUrl?: string;
      itemLabel?: string;
      siteName?: string;
    };
    if (!photoUrl) return res.status(400).json({ message: "photoUrl is required" });
    try {
      const result = await analysePhoto({ photoUrl, itemLabel, siteName });
      res.json(result);
    } catch (err) {
      console.error("analyse-photo failed:", (err as Error).message);
      res.status(500).json({ message: "Photo analysis failed. Please try again." });
    }
  });

  app.post("/api/ai/polish-note", requireAuth, async (req, res) => {
    if (!aiEnabled())
      return res.status(503).json({ message: "AI features require ANTHROPIC_API_KEY in the server environment" });
    const { text, itemLabel, siteName } = req.body as {
      text?: string;
      itemLabel?: string;
      siteName?: string;
    };
    if (!text || !text.trim()) return res.status(400).json({ message: "text is required" });
    try {
      const polished = await polishNote({ text, itemLabel, siteName });
      res.json({ text: polished });
    } catch (err) {
      console.error("polish-note failed:", (err as Error).message);
      res.status(500).json({ message: "Note polish failed. Please try again." });
    }
  });

  // ---------------- Analytics ----------------
  app.get("/api/analytics", requireAuth, (req, res) => {
    const range = (req.query.range as RangeKey) || "90";
    res.json(buildAnalytics(["30", "90", "365", "all"].includes(range) ? range : "90"));
  });

  // ---------------- Export (CSV / Excel) ----------------
  function sendXlsx(res: Response, buf: Buffer, name: string) {
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.send(buf);
  }
  function sendCsv(res: Response, csv: string, name: string) {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.send(csv);
  }
  const today = () => new Date().toISOString().slice(0, 10);

  app.get("/api/export/issues.xlsx", requireAuth, (_req, res) =>
    sendXlsx(res, xlsxBuffer("issues"), `fortis-fm-issues-${today()}.xlsx`)
  );
  app.get("/api/export/issues.csv", requireAuth, (_req, res) =>
    sendCsv(res, csvBuffer("issues"), `fortis-fm-issues-${today()}.csv`)
  );
  app.get("/api/export/sites.xlsx", requireAuth, (_req, res) =>
    sendXlsx(res, xlsxBuffer("sites"), `fortis-fm-sites-${today()}.xlsx`)
  );
  app.get("/api/export/sites.csv", requireAuth, (_req, res) =>
    sendCsv(res, csvBuffer("sites"), `fortis-fm-sites-${today()}.csv`)
  );
  app.get("/api/export/portfolio.xlsx", requireAuth, (_req, res) =>
    sendXlsx(res, xlsxBuffer("portfolio"), `fortis-fm-portfolio-${today()}.xlsx`)
  );
  app.get("/api/export/inspections/:id.xlsx", requireAuth, (req, res) =>
    sendXlsx(res, xlsxBuffer("inspection", Number(req.params.id)), `fortis-fm-inspection-${today()}.xlsx`)
  );
  app.get("/api/export/inspections/:id.csv", requireAuth, (req, res) =>
    sendCsv(res, csvBuffer("inspection", Number(req.params.id)), `fortis-fm-inspection-${today()}.csv`)
  );

  // ---------------- Push notifications ----------------
  app.get("/api/push/key", requireAuth, (_req, res) => {
    res.json({ enabled: pushEnabled(), publicKey: publicKey() });
  });
  app.post("/api/push/subscribe", requireAuth, (req, res) => {
    const u = (req as any).user;
    const { endpoint, keys } = req.body as { endpoint?: string; keys?: { p256dh: string; auth: string } };
    if (!endpoint || !keys?.p256dh || !keys?.auth)
      return res.status(400).json({ message: "Invalid subscription" });
    storage.addPushSubscription(u.id, endpoint, keys.p256dh, keys.auth);
    res.json({ ok: true });
  });
  app.post("/api/push/unsubscribe", requireAuth, (req, res) => {
    const { endpoint } = req.body as { endpoint?: string };
    if (endpoint) storage.removePushSubscription(endpoint);
    res.json({ ok: true });
  });

  // ---------------- Health (offline detection ping) ----------------
  app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

  // ---------------- Recurring inspection due check (hourly) ----------------
  configurePush();
  function checkDueInspections() {
    if (!pushEnabled()) return;
    const today = new Date().toISOString().slice(0, 10);
    for (const site of storage.listSites()) {
      if (site.nextDueDate === today && !storage.hasDraft(site.id)) {
        pushToAll({
          title: "Inspection due today",
          body: `${site.name} is due for inspection today.`,
          url: `/#/sites/${site.id}`,
        }).catch(() => {});
      }
    }
  }
  setInterval(checkDueInspections, 60 * 60 * 1000);

  return httpServer;
}
