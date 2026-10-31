/** Exact integer-grid extraction from the approved pixel LB SVGs. No rasterizer. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const columns = 24, pixelRows = 32;
const expected = {
  light: "7574b9bb30024b7acac6a44b5c52835c353086e4ffa54a58faf3096970a6d761",
  dark: "e3be28970afcbb66fc67b3f207ab868a9cc55fa5efc50905e304f5114eeca1e2",
};

export function deriveTerminalMark() {
  const palettes: Record<string, number[][]> = {};
  for (const appearance of ["light", "dark"] as const) {
    const path = `assets/branding/pixel-lb-${appearance}.svg`;
    const svg = readFileSync(new URL(path, root), "utf8");
    if (createHash("sha256").update(svg).digest("hex") !== expected[appearance]) throw new Error(`Source hash changed: ${path}`);
    if (!svg.includes('viewBox="0 0 24 32"')) throw new Error("Expected a 24x32 pixel grid");
    const color = svg.match(/<g fill="#([\da-fA-F]{6})">/)?.[1];
    if (!color || color.slice(0, 2) !== color.slice(2, 4) || color.slice(0, 2) !== color.slice(4, 6)) throw new Error("Expected neutral monochrome fill");
    const pixels = Array.from({ length: pixelRows }, () => Array<number>(columns).fill(-1));
    const tiles = [...svg.matchAll(/<path id="tile-(\d)" d="([^"]+)"\/>/g)];
    if (tiles.length !== 6 || tiles.some((tile, i) => Number(tile[1]) !== i + 1)) throw new Error("Expected six ordered LB tiles");
    for (const tile of tiles) {
      // Each path is a sequence of closed, one-row rectangles on the integer grid.
      const runs = [...tile[2]!.matchAll(/M(\d+) (\d+)h(\d+)v1h-(\d+)z/g)];
      if (runs.map(run => run[0]).join(" ") !== tile[2]) throw new Error("Unsupported pixel path");
      for (const run of runs) {
        const x = Number(run[1]), y = Number(run[2]), width = Number(run[3]);
        if (width < 1 || width !== Number(run[4]) || x + width > columns || y >= pixelRows) throw new Error("Invalid pixel run");
        for (let col = x; col < x + width; col++) {
          if (pixels[y]![col] !== -1) throw new Error("Overlapping LB tiles");
          pixels[y]![col] = parseInt(color.slice(0, 2), 16);
        }
      }
    }
    palettes[appearance] = pixels;
  }
  return {
    schemaVersion: 1, columns, pixelRows,
    provenance: {
      sources: ["light", "dark"].map(appearance => ({ path: `assets/branding/pixel-lb-${appearance}.svg`, sha256: expected[appearance as keyof typeof expected] })),
      ownerProvenance: "assets/branding/PROVENANCE.json",
      method: "Exact 24x32 integer SVG runs from six pixel LB tiles; -1 transparent, otherwise original neutral monochrome fill. No resampling or gradients.",
      authorization: "Owner-authorized LAB-HARNESS adaptation only. No general reuse license granted.",
    },
    light: palettes.light!, dark: palettes.dark!,
  };
}

if (import.meta.main) {
  const output = JSON.stringify(deriveTerminalMark(), null, 2)
    .replace(/\[\n\s+(-?\d+(?:,\n\s+-?\d+)*)\n\s+\]/g, (_match, values: string) => `[${values.replace(/\s+/g, "")}]`) + "\n";
  const target = new URL("src/pi/terminal-mark.json", root);
  if (process.argv.includes("--check")) {
    if (readFileSync(target, "utf8") !== output) throw new Error("Terminal mark is stale; regenerate it");
    console.log("Pixel LB terminal mark matches both source SVG hashes and exact grid");
  } else {
    writeFileSync(target, output);
    console.log(fileURLToPath(target));
  }
}
