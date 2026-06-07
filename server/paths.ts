import fs from "node:fs";
import path from "node:path";

// All persistent state lives under DATA_DIR. On Railway this is the mounted
// volume (set DATA_DIR=/data in the service env vars). In local dev it falls
// back to the project root so existing data.db and uploads keep working.
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd());

export const UPLOAD_DIR = path.resolve(DATA_DIR, "uploads");
export const PDF_DIR = path.resolve(UPLOAD_DIR, "reports");
export const DB_PATH = path.resolve(DATA_DIR, "data.db");

// Ensure directories exist on boot. Safe to call repeatedly.
export function ensureDirs(): void {
  for (const d of [DATA_DIR, UPLOAD_DIR, PDF_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}
