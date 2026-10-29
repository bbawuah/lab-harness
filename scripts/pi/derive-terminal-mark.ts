/** Offline, bounded sampler for the two owner-authorized SVGs. No rasterizer dependency. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const columns = 18, pixelRows = 24, samples = 8;
const expected = {
  light: "8aab0cd157a63c0d1982fcedadcddd3fd300e7227ac8f8431a4f3860c7723e71",
  dark: "5a46de364f7019736c6202e0f81384fc8ac1d87d68a46f515b740d2ebc5b8c29",
};
type Point = [number, number];

// Only the absolute SVG commands present in the canonical clip paths are supported.
function polygons(data: string): Point[][] {
  const tokens = data.match(/[A-Za-z]|-?\d+(?:\.\d+)?/g)!;
  const paths: Point[][] = [];
  let i = 0, p: Point = [0, 0], start: Point = p, path: Point[] = [];
  const number = () => {
    const n = Number(tokens[i++]);
    if (!Number.isFinite(n)) throw new Error("Invalid canonical path coordinate");
    return n;
  };
  while (i < tokens.length) {
    const command = tokens[i++];
    if (command === "M") { p = [number(), number()]; start = p; path = [p]; paths.push(path); }
    else if (command === "L") { p = [number(), number()]; path.push(p); }
    else if (command === "H") { p = [number(), p[1]]; path.push(p); }
    else if (command === "V") { p = [p[0], number()]; path.push(p); }
    else if (command === "C") {
      const a: Point = [number(), number()], b: Point = [number(), number()], c: Point = [number(), number()];
      const from = p;
      for (let step = 1; step <= 32; step++) {
        const t = step / 32, u = 1 - t;
        path.push([u ** 3 * from[0] + 3 * u * u * t * a[0] + 3 * u * t * t * b[0] + t ** 3 * c[0],
          u ** 3 * from[1] + 3 * u * u * t * a[1] + 3 * u * t * t * b[1] + t ** 3 * c[1]]);
      }
      p = c;
    } else if (command === "Z") { path.push(start); p = start; }
    else throw new Error(`Unsupported canonical SVG command: ${command}`);
  }
  return paths;
}
function inside(x: number, y: number, points: Point[]): boolean {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!, b = points[j]!;
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}

export function deriveTerminalMark() {
  const palettes: Record<string, number[][]> = {};
  for (const appearance of ["light", "dark"] as const) {
    const path = `assets/branding/terminal-b-${appearance}.svg`;
    const svg = readFileSync(new URL(path, root), "utf8");
    if (createHash("sha256").update(svg).digest("hex") !== expected[appearance]) throw new Error(`Source hash changed: ${path}`);
    const clip = svg.match(/<clipPath[\s\S]*?<\/clipPath>/)![0];
    const tiles = [...clip.matchAll(/<path d="([^"]+)"/g)].map(m => polygons(m[1]!));
    if (tiles.length !== 6) throw new Error("Expected six canonical tiles");
    const spots = [...svg.matchAll(/<radialGradient[^>]*cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"[^>]*>\s*<stop offset="0" stop-color="#([\da-f]{6})"/g)]
      .map(m => ({ x: Number(m[1]), y: Number(m[2]), r: Number(m[3]), gray: parseInt(m[4]!.slice(0, 2), 16) }));
    if (spots.length !== 4) throw new Error("Expected four canonical gradient spots");
    const base = parseInt(svg.match(/<rect[^>]*fill="#([\da-f]{6})"/)![1]!.slice(0, 2), 16);
    palettes[appearance] = Array.from({ length: pixelRows }, (_, row) => Array.from({ length: columns }, (_, col) => {
      const coverage = Array(6).fill(0) as number[];
      let gray = 0, count = 0;
      for (let sy = 0; sy < samples; sy++) for (let sx = 0; sx < samples; sx++) {
        const x = 226 + (col + (sx + 0.5) / samples) * 694.5 / columns;
        const y = 110 + (row + (sy + 0.5) / samples) * 926 / pixelRows;
        const tile = tiles.findIndex(paths => paths.some(poly => inside(x, y, poly)));
        if (tile < 0) continue;
        coverage[tile]!++;
        let value = base;
        for (const spot of spots) {
          const d = Math.hypot(x - spot.x, y - spot.y) / spot.r;
          const alpha = d >= 1 ? 0 : d <= 0.45 ? 1 - d * 0.2 / 0.45 : 0.8 * (1 - d) / 0.55;
          value = spot.gray * alpha + value * (1 - alpha);
        }
        gray += value; count++;
      }
      // Require 80% coverage by ONE tile, keeping open gutters even at this small scale.
      return Math.max(...coverage) / (samples * samples) < 0.8 ? -1 : Math.round(gray / count);
    }));
  }
  return {
    schemaVersion: 1, columns, pixelRows,
    provenance: {
      sources: ["light", "dark"].map(appearance => ({ path: `assets/branding/terminal-b-${appearance}.svg`, sha256: expected[appearance as keyof typeof expected] })),
      ownerProvenance: "assets/branding/PROVENANCE.json",
      method: "Absolute SVG paths; cubic curves flattened at 32 steps; 8x8 area samples; >=80% single-tile coverage preserves gutters; four radial overlays composited in SVG order; -1 transparent, otherwise neutral 8-bit gray.",
      authorization: "Owner-authorized LAB-HARNESS adaptation only. No general reuse license granted.",
    },
    light: palettes.light!, dark: palettes.dark!,
  };
}

if (import.meta.main) {
  // Keep each sampled scanline together so the stored shape is reviewable.
  const output = JSON.stringify(deriveTerminalMark(), null, 2)
    .replace(/\[\n\s+(-?\d+(?:,\n\s+-?\d+)*)\n\s+\]/g, (_match, values: string) => `[${values.replace(/\s+/g, "")}]`) + "\n";
  const target = new URL("src/pi/terminal-mark.json", root);
  if (process.argv.includes("--check")) {
    if (readFileSync(target, "utf8") !== output) throw new Error("Terminal mark is stale; regenerate it");
    console.log("Canonical terminal mark matches both source SVG hashes and derived samples");
  } else {
    writeFileSync(target, output);
    console.log(fileURLToPath(target));
  }
}
