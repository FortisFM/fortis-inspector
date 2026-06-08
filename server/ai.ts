import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { UPLOAD_DIR } from "./paths";

// Models. Sonnet for vision and the executive summary, Haiku for the cheap
// note polish. Both support vision and JSON output.
const MODEL_VISION = "claude-sonnet-4-5";
const MODEL_TEXT = "claude-haiku-4-5";

export function aiEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

// Shared writing rules baked into every prompt so the model never produces
// em dashes or filler language. Aggressive brevity: every word must earn its place.
const STYLE_RULES =
  "Write in plain Australian English. Be concise. Prefer the shortest accurate phrasing. " +
  "No filler. No preamble. No softening hedges (e.g. 'appears to be', 'seems', 'it should be noted'). " +
  "Never use em dashes. Use regular hyphens, commas or full stops. " +
  "Never use exclamation marks. " +
  "Never use the words: Let's, delve, navigate, leverage, robust, seamlessly, elevate, unlock, ensure, " +
  "comprehensive, holistic, optimise, utilise, additionally, furthermore. " +
  "State the fact directly. Keep all technical detail.";

function stripEmDashes(s: string): string {
  return (s || "").replace(/[\u2014\u2013]/g, "-").replace(/[\u2026]/g, "...");
}

// Detect mime from the file's magic bytes rather than its extension, because
// users sometimes upload PNGs renamed to .jpg or HEIC photos from iPhones.
function detectMediaType(buf: Buffer): "image/jpeg" | "image/png" | "image/webp" | "image/gif" {
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.length >= 4 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return "image/gif";
  return "image/jpeg";
}

function localImageBase64(url: string): { data: string; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" } | null {
  const file = path.basename(url.split("?")[0]);
  const full = path.resolve(UPLOAD_DIR, file);
  try {
    const buf = fs.readFileSync(full);
    return { data: buf.toString("base64"), mediaType: detectMediaType(buf) };
  } catch {
    return null;
  }
}

// Pull the first {...} block out of a string and JSON.parse it. Claude can
// sometimes wrap JSON in prose despite instructions, so we extract defensively.
function extractJson(s: string): any {
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch { /* ignore */ }
    }
    return {};
  }
}

function textOf(res: Anthropic.Message): string {
  const block = res.content.find((b) => b.type === "text") as Anthropic.TextBlock | undefined;
  return block?.text || "";
}

export interface PhotoAnalysis {
  description: string;
  severity: "Info" | "Minor" | "Moderate" | "Urgent";
  suggestedAction: string;
}

export async function analysePhoto(opts: {
  photoUrl: string;
  itemLabel?: string;
  siteName?: string;
}): Promise<PhotoAnalysis> {
  const img = opts.photoUrl.startsWith("http")
    ? null
    : localImageBase64(opts.photoUrl);
  if (!img && !opts.photoUrl.startsWith("http")) {
    throw new Error("Photo could not be read for analysis.");
  }

  const context = [
    opts.siteName ? `Site: ${opts.siteName}` : "",
    opts.itemLabel ? `Checklist item: ${opts.itemLabel}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const system =
    "You are a facilities management inspector reviewing a site inspection photo. " +
    STYLE_RULES +
    " Return strict JSON only with keys description, severity, suggestedAction. " +
    "severity must be exactly one of Info, Minor, Moderate, Urgent. " +
    "description: one sentence describing what is wrong or what is shown. Max 15 words. No introductions. " +
    "suggestedAction: one short phrase naming the trade and action. Max 10 words. No full sentences. " +
    "Examples of good output: " +
    `{"description":"Cracked floor tile near reception entry","severity":"Minor","suggestedAction":"Tiler to replace cracked tile"} ` +
    "Respond with the JSON object and nothing else.";

  const imageContent: Anthropic.ImageBlockParam = img
    ? {
        type: "image",
        source: { type: "base64", media_type: img.mediaType, data: img.data },
      }
    : {
        type: "image",
        source: { type: "url", url: opts.photoUrl },
      };

  const res = await getClient().messages.create({
    model: MODEL_VISION,
    max_tokens: 220,
    system,
    messages: [
      {
        role: "user",
        content: [
          imageContent,
          {
            type: "text",
            text:
              "Look at this facilities management inspection photo and return the JSON described.\n" +
              (context ? context : ""),
          },
        ],
      },
    ],
  });

  const parsed = extractJson(textOf(res));
  const sev = ["Info", "Minor", "Moderate", "Urgent"].includes(parsed.severity)
    ? parsed.severity
    : "Minor";
  return {
    description: stripEmDashes(String(parsed.description || "")),
    severity: sev,
    suggestedAction: stripEmDashes(String(parsed.suggestedAction || "")),
  };
}

export async function polishNote(opts: {
  text: string;
  itemLabel?: string;
  siteName?: string;
}): Promise<string> {
  const system =
    "You tidy rough inspector notes into one short sentence for a facilities management report. " +
    "Keep it under 25 words. Strip filler. Keep technical facts, measurements, locations. " +
    STYLE_RULES +
    " Output plain text only. No headings, no quotes, no preamble.";
  const context = [
    opts.siteName ? `Site: ${opts.siteName}` : "",
    opts.itemLabel ? `Item: ${opts.itemLabel}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const res = await getClient().messages.create({
    model: MODEL_TEXT,
    max_tokens: 180,
    system,
    messages: [
      {
        role: "user",
        content: `${context ? context + "\n\n" : ""}Rough note:\n${opts.text}`,
      },
    ],
  });
  return stripEmDashes(textOf(res).trim() || opts.text);
}

export async function executiveSummary(opts: {
  siteName: string;
  date: string;
  inspector: string;
  weather: string;
  counts: { pass: number; fail: number; na: number; observations: number };
  sections: string[];
  flagged: { label: string; severity: string; section?: string; note?: string; recommendedAction?: string }[];
}): Promise<string> {
  const system =
    "You write the executive summary for a facilities management site inspection report. " +
    "Write one or two paragraphs of flowing prose, around 120 to 200 words total. " +
    "Cover, in order: the overall condition of the site, what was inspected (use the section names), " +
    "the key items requiring attention with their severity, and any standout observations. " +
    "Refer to specific items by name where it helps. Do not invent items or numbers. " +
    "If nothing was flagged, say the site is in good condition and briefly note what was checked. " +
    STYLE_RULES +
    " Output plain text only. No headings, no bullet lists, no markdown.";

  const flaggedText = opts.flagged.length
    ? opts.flagged
        .map((f) => {
          const parts = [`- ${f.label} (${f.severity})`];
          if (f.section) parts.push(`section: ${f.section}`);
          if (f.note) parts.push(`note: ${f.note}`);
          if (f.recommendedAction) parts.push(`action: ${f.recommendedAction}`);
          return parts.join("; ");
        })
        .join("\n")
    : "No items were flagged.";

  const sectionsText = opts.sections.length
    ? opts.sections.join(", ")
    : "General checklist";

  const user = `Site: ${opts.siteName}
Date: ${opts.date}
Inspector: ${opts.inspector}
Weather: ${opts.weather || "Not recorded"}
Sections inspected: ${sectionsText}
Results: ${opts.counts.pass} pass, ${opts.counts.fail} fail, ${opts.counts.na} not applicable, ${opts.counts.observations} observation${opts.counts.observations === 1 ? "" : "s"}
Flagged items:
${flaggedText}

Write the executive summary as one or two paragraphs.`;

  const res = await getClient().messages.create({
    model: MODEL_VISION,
    max_tokens: 700,
    system,
    messages: [{ role: "user", content: user }],
  });
  return stripEmDashes(textOf(res).trim());
}
