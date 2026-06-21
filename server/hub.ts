// Fortis FM Hub integration. Used to:
//  1) Verify our site slugs match what the Hub knows (GET /api/inspector/sites).
//  2) Create a Work Request when an inspector flags an item (POST /api/inspector/work-orders).
//
// All Hub calls go server-to-server so the HUB_API_KEY never reaches the browser.

const DEFAULT_BASE_URL = "https://hub.fortisfm.com.au";

export type HubSiteSummary = { slug: string; nickname: string };

export type HubWorkRequestInput = {
  siteSlug: string;
  title: string;
  description: string;
  priority?: "low" | "medium" | "high" | "emergency" | "routine";
  locationDetail?: string;
  inspector?: { name?: string; email?: string; phone?: string };
  inspectionRef?: string;
  inspectionUrl?: string;
  attachmentUrls?: string[];
};

export type HubWorkRequestResult = {
  ok: true;
  workOrderId: string;
  reference: string;
  hubUrl: string;
};

function getHubConfig(): { apiKey: string; baseUrl: string } | null {
  const apiKey = process.env.HUB_API_KEY;
  const baseUrl = process.env.HUB_BASE_URL || DEFAULT_BASE_URL;
  if (!apiKey) return null;
  return { apiKey, baseUrl };
}

export function hubEnabled(): boolean {
  return !!process.env.HUB_API_KEY;
}

export async function listHubSites(): Promise<HubSiteSummary[]> {
  const cfg = getHubConfig();
  if (!cfg) throw new Error("HUB_API_KEY not configured");
  const res = await fetch(`${cfg.baseUrl}/api/inspector/sites`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`Hub returned ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data?.sites) ? data.sites : [];
}

export async function createHubWorkRequest(input: HubWorkRequestInput): Promise<HubWorkRequestResult> {
  const cfg = getHubConfig();
  if (!cfg) throw new Error("HUB_API_KEY not configured");
  const res = await fetch(`${cfg.baseUrl}/api/inspector/work-orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    let message = `Hub returned HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error) message = j.error;
    } catch {}
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return {
    ok: true,
    workOrderId: data.workOrderId,
    reference: data.reference,
    hubUrl: data.hubUrl,
  };
}
