import fs from "fs";
import nodemailer, { Transporter } from "nodemailer";

type Inspection = {
  id: string;
  inspectorName?: string | null;
  inspectionDate?: string | null;
  createdAt?: string | null;
  status?: string | null;
};

type Site = {
  id: string;
  name: string;
  address?: string | null;
};

type IssuePhoto = { url: string };

type IssueSummary = {
  label: string;
  severity?: string | null;
  section?: string | null;
  note?: string | null;
  recommendedAction?: string | null;
  photos: IssuePhoto[];
};

type SendOpts = {
  inspectionId: string;
  pdfPath: string;
  site: Site;
  inspection: Inspection;
  issues?: IssueSummary[];
};

const REPORT_RECIPIENT = "admin@fortisfm.com.au";

const SEV_LABEL: Record<string, string> = {
  urgent: "Urgent",
  moderate: "Moderate",
  minor: "Minor",
  info: "Info",
};
const SEV_COLOUR: Record<string, string> = {
  urgent: "#b91c1c",
  moderate: "#c2410c",
  minor: "#b45309",
  info: "#475569",
};
const SEV_ORDER: Record<string, number> = { urgent: 0, moderate: 1, minor: 2, info: 3 };

let cachedTransport: Transporter | null = null;
let cachedKey: string | null = null;

function buildTransport(): Transporter | null {
  const host = process.env.SMTP_HOST;
  const portStr = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !portStr || !user || !pass) {
    return null;
  }

  const port = Number(portStr);
  const key = `${host}|${port}|${user}`;
  if (cachedTransport && cachedKey === key) {
    return cachedTransport;
  }

  const secure = port === 465;
  cachedTransport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    requireTLS: !secure,
  });
  cachedKey = key;
  return cachedTransport;
}

function fmtDate(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export async function sendInspectionReportEmail(opts: SendOpts): Promise<void> {
  const transport = buildTransport();
  if (!transport) {
    console.log(
      `[mailer] SMTP not configured, skipping email for inspection ${opts.inspectionId}`,
    );
    return;
  }

  const from = process.env.SMTP_FROM || REPORT_RECIPIENT;
  const { inspectionId, pdfPath, site, inspection } = opts;

  if (!fs.existsSync(pdfPath)) {
    console.warn(`[mailer] PDF not found at ${pdfPath}, skipping email`);
    return;
  }

  const dateLabel = fmtDate(inspection.inspectionDate || inspection.createdAt);
  const inspector = inspection.inspectorName || "Not recorded";

  // Sort issues by severity, urgent first.
  const issues = (opts.issues || [])
    .slice()
    .sort((a, b) => (SEV_ORDER[a.severity || "info"] ?? 9) - (SEV_ORDER[b.severity || "info"] ?? 9));

  const issuesByCount: Record<string, number> = {};
  issues.forEach((i) => {
    const k = (i.severity || "info").toLowerCase();
    issuesByCount[k] = (issuesByCount[k] || 0) + 1;
  });
  const issuesHeader = issues.length
    ? `${issues.length} item${issues.length === 1 ? "" : "s"} flagged`
    : "No issues flagged";

  const subject = `Site inspection report: ${site.name}${dateLabel ? ` (${dateLabel})` : ""}`;

  // Plain text body
  const textLines: string[] = [
    `Site: ${site.name}`,
    site.address ? `Address: ${site.address}` : null,
    dateLabel ? `Inspection date: ${dateLabel}` : null,
    `Inspector: ${inspector}`,
    `Inspection ID: ${inspectionId}`,
    "",
    issuesHeader + (issues.length ? ":" : "."),
  ].filter(Boolean) as string[];

  issues.forEach((i, idx) => {
    const sev = SEV_LABEL[(i.severity || "info").toLowerCase()] || "Info";
    textLines.push("");
    textLines.push(`${idx + 1}. [${sev}] ${i.label}`);
    if (i.section) textLines.push(`   Area: ${i.section}`);
    if (i.note) textLines.push(`   Details: ${i.note}`);
    if (i.recommendedAction) textLines.push(`   Recommended action: ${i.recommendedAction}`);
    if (i.photos.length) {
      textLines.push("   Photos:");
      i.photos.forEach((p) => textLines.push(`     ${p.url}`));
    }
  });

  textLines.push("");
  textLines.push("The full report is attached as a PDF.");

  // HTML body
  const sevSummary = Object.entries(issuesByCount)
    .map(([k, n]) => `<span style="display:inline-block;margin-right:10px;color:${SEV_COLOUR[k] || "#475569"};font-weight:600">${SEV_LABEL[k] || k}: ${n}</span>`)
    .join("");

  const issuesHtml = issues.length
    ? `
      <h3 style="color:#090b38;margin:18px 0 8px;font-family:Georgia,serif">Issues flagged</h3>
      <div style="margin:0 0 12px">${sevSummary}</div>
      <ol style="padding-left:20px;margin:0">
        ${issues.map((i) => {
          const sevKey = (i.severity || "info").toLowerCase();
          const sevColor = SEV_COLOUR[sevKey] || "#475569";
          const sev = SEV_LABEL[sevKey] || "Info";
          const photos = i.photos.length
            ? `<div style="margin-top:6px">${i.photos
                .map((p, idx) => `<a href="${p.url}" style="display:inline-block;margin-right:8px;color:#1d4ed8;text-decoration:underline;font-size:13px">Photo ${idx + 1}</a>`)
                .join("")}</div>`
            : "";
          return `
            <li style="margin:0 0 14px;padding:0">
              <div style="font-weight:600;color:#0f172a">
                <span style="display:inline-block;padding:1px 8px;border-radius:4px;background:${sevColor};color:#fff;font-size:11px;margin-right:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px">${sev}</span>
                ${escapeHtml(i.label)}
              </div>
              ${i.section ? `<div style="font-size:13px;color:#475569;margin-top:2px"><strong>Area:</strong> ${escapeHtml(i.section)}</div>` : ""}
              ${i.note ? `<div style="font-size:13px;color:#1e293b;margin-top:2px">${escapeHtml(i.note)}</div>` : ""}
              ${i.recommendedAction ? `<div style="font-size:13px;color:#1e293b;margin-top:2px"><strong>Recommended action:</strong> ${escapeHtml(i.recommendedAction)}</div>` : ""}
              ${photos}
            </li>`;
        }).join("")}
      </ol>`
    : `<p style="margin:18px 0 0;color:#15803d"><strong>No issues flagged.</strong></p>`;

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; max-width:680px">
      <h2 style="color:#090b38;margin:0 0 12px;font-family:Georgia,serif">Site inspection report</h2>
      <p style="margin:0 0 4px"><strong>Site:</strong> ${escapeHtml(site.name)}</p>
      ${site.address ? `<p style="margin:0 0 4px"><strong>Address:</strong> ${escapeHtml(site.address)}</p>` : ""}
      ${dateLabel ? `<p style="margin:0 0 4px"><strong>Inspection date:</strong> ${escapeHtml(dateLabel)}</p>` : ""}
      <p style="margin:0 0 4px"><strong>Inspector:</strong> ${escapeHtml(inspector)}</p>
      <p style="margin:0 0 4px"><strong>Inspection ID:</strong> ${escapeHtml(inspectionId)}</p>
      ${issuesHtml}
      <p style="margin:18px 0 0;color:#475569;font-size:13px">The full report is attached as a PDF.</p>
    </div>
  `;

  try {
    await transport.sendMail({
      from,
      to: REPORT_RECIPIENT,
      subject,
      text: textLines.join("\n"),
      html,
      attachments: [
        {
          filename: `inspection-${inspectionId}.pdf`,
          path: pdfPath,
          contentType: "application/pdf",
        },
      ],
    });
    console.log(
      `[mailer] Sent inspection ${inspectionId} report to ${REPORT_RECIPIENT} with ${issues.length} issue(s)`,
    );
  } catch (err) {
    console.error(`[mailer] Failed to send inspection ${inspectionId}:`, err);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
