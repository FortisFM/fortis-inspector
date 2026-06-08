import fs from "fs";
import path from "path";
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

type SendOpts = {
  inspectionId: string;
  pdfPath: string;
  site: Site;
  inspection: Inspection;
};

const REPORT_RECIPIENT = "admin@fortisfm.com.au";

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

  const subject = `Site inspection report: ${site.name}${dateLabel ? ` (${dateLabel})` : ""}`;

  const textLines = [
    `Site: ${site.name}`,
    site.address ? `Address: ${site.address}` : null,
    dateLabel ? `Inspection date: ${dateLabel}` : null,
    `Inspector: ${inspector}`,
    `Inspection ID: ${inspectionId}`,
    "",
    "The full report is attached as a PDF.",
  ].filter(Boolean) as string[];

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #1a1a1a;">
      <h2 style="color: #090b38; margin: 0 0 12px;">Site inspection report</h2>
      <p style="margin: 0 0 4px;"><strong>Site:</strong> ${escapeHtml(site.name)}</p>
      ${site.address ? `<p style="margin: 0 0 4px;"><strong>Address:</strong> ${escapeHtml(site.address)}</p>` : ""}
      ${dateLabel ? `<p style="margin: 0 0 4px;"><strong>Inspection date:</strong> ${escapeHtml(dateLabel)}</p>` : ""}
      <p style="margin: 0 0 4px;"><strong>Inspector:</strong> ${escapeHtml(inspector)}</p>
      <p style="margin: 0 0 12px;"><strong>Inspection ID:</strong> ${escapeHtml(inspectionId)}</p>
      <p style="margin: 12px 0 0;">The full report is attached as a PDF.</p>
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
      `[mailer] Sent inspection ${inspectionId} report to ${REPORT_RECIPIENT}`,
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
