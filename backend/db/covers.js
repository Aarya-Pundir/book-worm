// Locally generated SVG book covers (no external images, no licensing concerns).
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BOOKS } from "./seed-data.js";

export const COVERS_URL_PREFIX = "/covers";
export const FALLBACK_COVER_URL = `${COVERS_URL_PREFIX}/fallback.svg`;
export const coverUrlFor = (isbn) => `${COVERS_URL_PREFIX}/${isbn}.svg`;

const escapeXml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function wrap(text, max = 16) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if ((line + " " + word).trim().length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = (line + " " + word).trim();
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 5);
}

export function coverSvg({ title, author }) {
  const hue = parseInt(createHash("sha1").update(title).digest("hex").slice(0, 4), 16) % 360;
  const lines = wrap(title);
  const text = lines
    .map((l, i) => `<tspan x="150" dy="${i === 0 ? 0 : 30}">${escapeXml(l)}</tspan>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450" role="img" aria-label="${escapeXml(title)}">
<rect width="300" height="450" fill="hsl(${hue},45%,28%)"/>
<rect x="14" y="14" width="272" height="422" fill="none" stroke="hsl(${hue},60%,75%)" stroke-width="2"/>
<text x="150" y="150" text-anchor="middle" font-family="Georgia, serif" font-size="24" font-weight="bold" fill="#ffffff">${text}</text>
<text x="150" y="400" text-anchor="middle" font-family="Georgia, serif" font-size="16" fill="hsl(${hue},60%,85%)">${escapeXml(author)}</text>
</svg>
`;
}

export const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450" role="img" aria-label="Cover not available">
<rect width="300" height="450" fill="#e5e7eb"/>
<text x="150" y="225" text-anchor="middle" font-family="Georgia, serif" font-size="20" fill="#57606a">Cover not available</text>
</svg>
`;

export async function writeCovers(outDir) {
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "fallback.svg"), FALLBACK_SVG);
  for (const b of BOOKS) {
    await writeFile(path.join(outDir, `${b.isbn}.svg`), coverSvg({ title: b.title, author: b.authors[0] }));
  }
  return BOOKS.length + 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const out = path.resolve(here, "../../frontend/public/covers");
  const n = await writeCovers(out);
  console.log(`Wrote ${n} cover files`);
}
