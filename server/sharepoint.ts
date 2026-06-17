import fs from "fs";

/**
 * SharePoint integration via Microsoft Graph using client_credentials OAuth flow.
 *
 * Required env vars:
 *   AZURE_TENANT_ID
 *   AZURE_CLIENT_ID
 *   AZURE_CLIENT_SECRET
 *   SHAREPOINT_HOST           e.g. fortisfm.sharepoint.com
 *   SHAREPOINT_SITE_PATH      e.g. /sites/FortisFM
 *
 * Optional:
 *   SHAREPOINT_DRIVE_NAME     defaults to Documents (the default library).
 *
 * If any required env var is missing, every call no-ops and logs a single line.
 * This mirrors the mailer pattern so missing config never breaks inspections.
 */

type TokenCache = {
  accessToken: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;
let siteIdCache: string | null = null;
let driveIdCache: string | null = null;

function envOrNull(): null | {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  host: string;
  sitePath: string;
  driveName: string;
} {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const host = process.env.SHAREPOINT_HOST;
  const sitePath = process.env.SHAREPOINT_SITE_PATH;
  const driveName = process.env.SHAREPOINT_DRIVE_NAME || "Documents";
  if (!tenantId || !clientId || !clientSecret || !host || !sitePath) return null;
  return { tenantId, clientId, clientSecret, host, sitePath, driveName };
}

export function sharePointEnabled(): boolean {
  return envOrNull() !== null;
}

async function getAccessToken(): Promise<string | null> {
  const env = envOrNull();
  if (!env) return null;
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt - 60_000 > now) {
    return tokenCache.accessToken;
  }
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(env.tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: env.clientId,
    client_secret: env.clientSecret,
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default",
  });
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[sharepoint] Token request failed: ${res.status} ${text.slice(0, 200)}`);
    return null;
  }
  const json: any = await res.json();
  const accessToken: string = json.access_token;
  const expiresIn: number = json.expires_in || 3600;
  tokenCache = { accessToken, expiresAt: now + expiresIn * 1000 };
  return accessToken;
}

async function graphGet(path: string, token: string): Promise<any> {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Graph GET ${path} failed: ${res.status} ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function graphPut(path: string, token: string, body: Buffer, contentType: string): Promise<any> {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": contentType },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Graph PUT ${path} failed: ${res.status} ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function getSiteAndDriveId(token: string): Promise<{ siteId: string; driveId: string } | null> {
  const env = envOrNull();
  if (!env) return null;
  if (siteIdCache && driveIdCache) {
    return { siteId: siteIdCache, driveId: driveIdCache };
  }
  // Site lookup by host + relative path
  const sitePath = env.sitePath.startsWith("/") ? env.sitePath : `/${env.sitePath}`;
  const site = await graphGet(`/sites/${env.host}:${sitePath}`, token);
  const siteId: string = site.id;
  // List drives, pick by name (default Documents)
  const drives = await graphGet(`/sites/${siteId}/drives`, token);
  const wanted = env.driveName.toLowerCase();
  const match =
    drives.value.find((d: any) => (d.name || "").toLowerCase() === wanted) ||
    drives.value.find((d: any) => (d.name || "").toLowerCase() === "shared documents") ||
    drives.value[0];
  if (!match) {
    console.error(`[sharepoint] No drives found on site ${env.sitePath}`);
    return null;
  }
  siteIdCache = siteId;
  driveIdCache = match.id;
  return { siteId, driveId: match.id };
}

function sanitiseFolderSegment(s: string): string {
  // SharePoint disallows: " * : < > ? / \ |  and trailing dots/spaces
  return s
    .replace(/[\"\*:<>\?\/\\|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\.\s]+$/g, "")
    .slice(0, 120) || "Untitled";
}

/**
 * Upload an inspection PDF to SharePoint at:
 *   <drive>/Inspections/{Site Name}/{YYYY}/{filename}.pdf
 *
 * Returns the web URL of the uploaded file or null on failure.
 * Silently no-ops if SharePoint env vars are missing.
 */
export async function uploadInspectionPdf(params: {
  siteName: string;
  year: number | string;
  filename: string;
  pdfPath: string;
}): Promise<string | null> {
  const env = envOrNull();
  if (!env) {
    console.log(`[sharepoint] Not configured, skipping upload for ${params.filename}`);
    return null;
  }
  try {
    if (!fs.existsSync(params.pdfPath)) {
      console.warn(`[sharepoint] PDF not found at ${params.pdfPath}, skipping upload`);
      return null;
    }
    const token = await getAccessToken();
    if (!token) return null;
    const ids = await getSiteAndDriveId(token);
    if (!ids) return null;

    const siteFolder = sanitiseFolderSegment(params.siteName);
    const year = String(params.year).slice(0, 4);
    const filename = sanitiseFolderSegment(params.filename.replace(/\.pdf$/i, "")) + ".pdf";

    // Path inside the drive. Graph supports auto-creating parent folders on PUT to .../root:/PATH:/content
    const pathInDrive = `Inspections/${siteFolder}/${year}/${filename}`;
    const encoded = pathInDrive.split("/").map(encodeURIComponent).join("/");
    const buffer = fs.readFileSync(params.pdfPath);
    const uploadPath = `/drives/${ids.driveId}/root:/${encoded}:/content`;
    const result = await graphPut(uploadPath, token, buffer, "application/pdf");
    const webUrl = result?.webUrl || null;
    console.log(`[sharepoint] Uploaded ${pathInDrive} (${buffer.length} bytes)`);
    return webUrl;
  } catch (err: any) {
    console.error(`[sharepoint] Upload failed for ${params.filename}:`, err?.message || err);
    return null;
  }
}
