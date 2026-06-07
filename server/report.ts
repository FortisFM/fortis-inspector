import fs from "node:fs";
import path from "node:path";
import { storage } from "./storage";
import { severityRank } from "@shared/schema";
import type { Inspection, Site, InspectionEntry, EntryPhoto } from "@shared/schema";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
const ASSETS_DIR = path.resolve(process.cwd(), "attached_assets");

function fileToDataUri(filePath: string, mime: string): string {
  try {
    const buf = fs.readFileSync(filePath);
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return "";
  }
}

function photoDataUri(photo: EntryPhoto): string {
  const full = path.resolve(UPLOAD_DIR, path.basename(photo.filePath));
  return fileToDataUri(full, "image/jpeg");
}

const navyLogo = () =>
  fileToDataUri(path.resolve(ASSETS_DIR, "logo-navy-on-white.jpg"), "image/jpeg");

const SEV_LABEL: Record<string, string> = {
  info: "Info",
  minor: "Minor",
  moderate: "Moderate",
  urgent: "Urgent",
};
const SEV_COLOR: Record<string, string> = {
  info: "#64748b",
  minor: "#f59e0b",
  moderate: "#ea580c",
  urgent: "#dc2626",
};
const STATUS_COLOR: Record<string, string> = {
  pass: "#059669",
  fail: "#dc2626",
  na: "#94a3b8",
  observation: "#090b38",
};
const STATUS_LABEL: Record<string, string> = {
  pass: "PASS",
  fail: "FAIL",
  na: "N/A",
  observation: "OBSERVATION",
};

function esc(s: string): string {
  return (s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}

function fmtDate(ts: number | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleString("en-AU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildReportHtml(inspectionId: number): string {
  const inspection = storage.getInspection(inspectionId) as Inspection;
  const site = storage.getSite(inspection.siteId) as Site;
  const entries = storage.listEntries(inspectionId);
  const photosByEntry = new Map<number, EntryPhoto[]>();
  for (const e of entries) photosByEntry.set(e.id, storage.listPhotos(e.id));

  const checklistEntries = entries.filter((e) => !e.isObservation);
  const observationEntries = entries.filter((e) => e.isObservation);

  // Maintenance items: fails with severity >= minor, plus observations severity >= minor
  const maintenance = entries
    .filter(
      (e) =>
        (e.status === "fail" || e.isObservation) &&
        e.severity &&
        severityRank[e.severity] >= severityRank["minor"]
    )
    .sort((a, b) => (severityRank[b.severity || "info"] || 0) - (severityRank[a.severity || "info"] || 0));

  const sevBadge = (sev: string | null) =>
    sev
      ? `<span class="badge" style="background:${SEV_COLOR[sev]}">${SEV_LABEL[sev]}</span>`
      : "";
  const statusBadge = (status: string) =>
    `<span class="badge" style="background:${STATUS_COLOR[status]}">${STATUS_LABEL[status]}</span>`;

  const photoGrid = (entryId: number) => {
    const photos = photosByEntry.get(entryId) || [];
    if (!photos.length) return "";
    return `<div class="photos">${photos
      .map((p) => `<img class="photo" src="${photoDataUri(p)}" />`)
      .join("")}</div>`;
  };

  const entryBlock = (e: InspectionEntry) => `
    <div class="entry">
      <div class="entry-head">
        <div class="entry-title">${e.section ? `<span class="section">${esc(e.section)}</span>` : ""}${esc(e.label || "Observation")}</div>
        <div class="badges">${statusBadge(e.status)}${sevBadge(e.severity)}</div>
      </div>
      ${e.note ? `<div class="note">${esc(e.note)}</div>` : ""}
      ${photoGrid(e.id)}
    </div>`;

  const maintenanceBlock = (e: InspectionEntry, idx: number) => `
    <div class="maint-item">
      <div class="maint-num">${idx + 1}</div>
      <div class="maint-body">
        <div class="maint-head">
          <div class="maint-title">${esc(e.label || "Observation")}</div>
          ${sevBadge(e.severity)}
        </div>
        ${e.section ? `<div class="maint-sec">${esc(e.section)}</div>` : ""}
        ${e.note ? `<div class="note">${esc(e.note)}</div>` : ""}
        ${(() => {
          const photos = photosByEntry.get(e.id) || [];
          return photos.length
            ? `<div class="photos">${photos
                .slice(0, 3)
                .map((p) => `<img class="thumb" src="${photoDataUri(p)}" />`)
                .join("")}</div>`
            : "";
        })()}
        <div class="action-area"><span class="action-label">Suggested action:</span> <span class="action-line">__________________________________________________</span></div>
      </div>
    </div>`;

  const groupedChecklist = (() => {
    const sections = new Map<string, InspectionEntry[]>();
    for (const e of checklistEntries) {
      const key = e.section || "General";
      if (!sections.has(key)) sections.set(key, []);
      sections.get(key)!.push(e);
    }
    return Array.from(sections.entries())
      .map(
        ([section, items]) =>
          `<h2 class="section-header">${esc(section)}</h2>${items.map(entryBlock).join("")}`
      )
      .join("");
  })();

  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  @page { margin: 96px 40px 64px 40px; }
  * { box-sizing: border-box; }
  html, body { background: #ffffff !important; margin: 0; padding: 0; color: #111; }
  body { font-family: 'Montserrat', Arial, sans-serif; font-size: 12px; line-height: 1.5; }
  h1, h2, h3, .serif { font-family: Georgia, 'Times New Roman', serif; }
  .cover { text-align: center; padding-top: 60px; page-break-after: always; }
  .cover img { max-width: 320px; margin: 0 auto 40px; display: block; }
  .cover h1 { font-size: 30px; color: #090b38; margin: 0 0 8px; }
  .cover .sub { color: #64748b; letter-spacing: 2px; text-transform: uppercase; font-size: 11px; margin-bottom: 48px; }
  .cover .meta { margin-top: 32px; font-size: 14px; }
  .cover .meta .site-name { font-family: Georgia, serif; font-size: 22px; color: #090b38; margin-bottom: 4px; }
  .cover .meta .row { color: #334155; margin: 2px 0; }
  .cover .divider { width: 80px; height: 3px; background: #090b38; margin: 24px auto; }
  .section-block { page-break-inside: avoid; }
  h2.section-header { color: #090b38; font-size: 16px; border-bottom: 2px solid #090b38; padding-bottom: 4px; margin: 24px 0 12px; }
  .summary-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 20px; margin-bottom: 16px; }
  .summary-card .label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; }
  .summary-card .value { font-size: 13px; color: #111; margin-bottom: 8px; }
  .entry { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; margin-bottom: 12px; page-break-inside: avoid; }
  .entry-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
  .entry-title { font-weight: 600; font-size: 13px; color: #0f172a; }
  .entry-title .section { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; font-weight: 600; }
  .badges { display: flex; gap: 6px; flex-shrink: 0; }
  .badge { color: #fff; font-size: 10px; font-weight: 700; padding: 3px 9px; border-radius: 999px; white-space: nowrap; letter-spacing: .5px; }
  .note { color: #475569; margin-top: 8px; font-size: 12px; white-space: pre-wrap; }
  .photos { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .photo { width: 180px; max-width: 280px; height: auto; border-radius: 6px; border: 1px solid #e2e8f0; object-fit: cover; }
  .thumb { width: 110px; height: 90px; object-fit: cover; border-radius: 6px; border: 1px solid #e2e8f0; }
  .maint-page { page-break-before: always; }
  .maint-item { display: flex; gap: 12px; border: 1px solid #e2e8f0; border-left: 4px solid #dc2626; border-radius: 8px; padding: 12px 14px; margin-bottom: 12px; page-break-inside: avoid; }
  .maint-num { width: 26px; height: 26px; border-radius: 50%; background: #090b38; color: #fff; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 12px; }
  .maint-body { flex: 1; }
  .maint-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .maint-title { font-weight: 600; font-size: 13px; color: #0f172a; }
  .maint-sec { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-top: 2px; }
  .action-area { margin-top: 10px; font-size: 11px; color: #64748b; }
  .action-label { font-weight: 600; color: #334155; }
  .empty { color: #94a3b8; font-style: italic; padding: 12px 0; }
</style></head>
<body>
  <div class="cover">
    ${navyLogo() ? `<img src="${navyLogo()}" />` : `<h1>Fortis FM</h1>`}
    <h1>Site Inspection Report</h1>
    <div class="sub">Facilities Management Specialists</div>
    <div class="divider"></div>
    <div class="meta">
      <div class="site-name">${esc(site.name)}</div>
      ${site.address ? `<div class="row">${esc(site.address)}</div>` : ""}
      <div class="row" style="margin-top:16px;">Inspection Date: ${esc(fmtDate(inspection.submittedAt || inspection.startedAt))}</div>
      <div class="row">Inspector: ${esc(inspection.inspectorName)}</div>
    </div>
  </div>

  <div class="section-block">
    <h2 class="section-header">Site Details</h2>
    <div class="summary-card">
      <div class="label">Site</div><div class="value">${esc(site.name)}</div>
      ${site.address ? `<div class="label">Address</div><div class="value">${esc(site.address)}</div>` : ""}
      ${site.clientName ? `<div class="label">Client Contact</div><div class="value">${esc(site.clientName)}${site.clientEmail ? " &middot; " + esc(site.clientEmail) : ""}${site.clientPhone ? " &middot; " + esc(site.clientPhone) : ""}</div>` : ""}
      <div class="label">Inspector</div><div class="value">${esc(inspection.inspectorName)}</div>
      ${inspection.weather ? `<div class="label">Weather / Conditions</div><div class="value">${esc(inspection.weather)}</div>` : ""}
      ${inspection.generalNotes ? `<div class="label">General Notes</div><div class="value">${esc(inspection.generalNotes)}</div>` : ""}
    </div>
  </div>

  <div class="section-block">
    <h2 class="section-header">Inspection Checklist</h2>
    ${groupedChecklist || '<div class="empty">No checklist items recorded.</div>'}
  </div>

  ${
    observationEntries.length
      ? `<div class="section-block"><h2 class="section-header">Observations</h2>${observationEntries.map(entryBlock).join("")}</div>`
      : ""
  }

  <div class="maint-page">
    <h2 class="section-header">Maintenance Items Requiring Attention</h2>
    ${
      maintenance.length
        ? maintenance.map(maintenanceBlock).join("")
        : '<div class="empty">No maintenance items flagged. All checks passed or were non-critical.</div>'
    }
  </div>
</body></html>`;
}

export function footerTemplate(): string {
  return `<div style="width:100%; font-size:8px; color:#64748b; font-family: Arial, sans-serif; padding:0 40px; display:flex; justify-content:space-between; align-items:center;">
    <span>Fortis FM &middot; (07) 3472 7579 &middot; admin@fortisfm.com.au</span>
    <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
  </div>`;
}

export function headerTemplate(): string {
  return `<div style="width:100%; font-size:8px; color:#94a3b8; font-family: Arial, sans-serif; padding:0 40px; text-align:right;">Fortis FM Site Inspection Report</div>`;
}
