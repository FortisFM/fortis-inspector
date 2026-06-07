import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "attached_assets", "logo-white-on-navy.jpg");
const outDir = path.join(root, "client", "public");
fs.mkdirSync(outDir, { recursive: true });

const NAVY = { r: 9, g: 11, b: 56 };

// Maskable + standard icons. Pad the logo onto a navy square so it reads
// well as a launcher icon and survives the safe-zone mask crop.
async function make(size, name, pad) {
  const inner = Math.round(size * (1 - pad * 2));
  const logo = await sharp(src)
    .resize(inner, inner, { fit: "contain", background: NAVY })
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: NAVY },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(path.join(outDir, name));
  console.log("wrote", name);
}

await make(192, "icon-192.png", 0.12);
await make(512, "icon-512.png", 0.12);
// Maskable needs a bigger safe zone (logo smaller).
await make(512, "icon-maskable-512.png", 0.2);
// Apple touch icon + favicon.
await make(180, "apple-touch-icon.png", 0.12);
await make(32, "favicon.png", 0.08);
console.log("done");
