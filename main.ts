// Starlane Courier — the hand-in program for make.fun's best-game-01.
// The game is the static site in game/ (ES modules plus a vendored
// three.js, no build step, no network). This program copies game/ and
// screenshots/ into the output directory and writes the dossier the
// judge reads, using the kit's own buildDossier from
// vendor/makefun-game.ts with the scorer's caps, so the bytes produced
// here are exactly the bytes the gate rebuilds and compares.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output.
// Play the game locally with `node serve.ts` (http://localhost:8080).

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Verify the screenshot set before anything is copied: the judge's
// first impression is these four frames, named in presentation order
// (the cover is the first file by name). A missing or oversized frame
// is a hand-in the scorer would judge blind, so fail here instead.
const EXPECTED_SHOTS = ['1-title.jpg', '2-play.jpg', '3-rush.jpg', '4-over.jpg'];
const MAX_SHOT_BYTES = 262144;
const shotReport = [];
for (const name of EXPECTED_SHOTS) {
  const path = join(repoRoot, 'screenshots', name);
  if (!existsSync(path)) throw new Error(`screenshot set incomplete: missing screenshots/${name}`);
  const bytes = statSync(path).size;
  if (bytes > MAX_SHOT_BYTES) {
    throw new Error(`screenshot too large: screenshots/${name} is ${bytes} bytes (cap ${MAX_SHOT_BYTES})`);
  }
  shotReport.push(`${name} ${(bytes / 1024).toFixed(1)} KiB`);
}
console.log(`screenshots verified: ${shotReport.join(' · ')}`);

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// The caps are the gate's own (reference/gate.json): a 160 KiB dossier
// text, at most 4 screenshots of at most 256 KiB each, at most 993
// entries and 48 MiB under game/, no path under game/ over 1,000 bytes.
// Anything beyond them is an entry the scorer would refuse, so the
// dossier builder is told the same limits.
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

// Self-check the finished output against the platform's overall entry
// limits (1000 entries, 64 MiB): a build the platform would refuse at
// upload time fails here instead, with the numbers printed.
const MAX_ENTRIES = 1000;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(full));
    else found.push(full);
  }
  return found;
}
const outFiles = walk(outputDir);
const outBytes = outFiles.reduce((sum, file) => sum + statSync(file).size, 0);
if (outFiles.length > MAX_ENTRIES || outBytes > MAX_TOTAL_BYTES) {
  throw new Error(`output exceeds platform limits: ${outFiles.length} entries, ${outBytes} bytes`);
}
// Verify the copied screenshots' real pixel dimensions, parsed from
// the image headers themselves (JPEG start-of-frame / PNG IHDR — no
// decoder needed): the gate caps the long side at 1280 px and the
// short side must stay at or above 480 px, so a wrongly-sized render
// fails here rather than at judging time.
function imageDimensions(path) {
  const bytes = readFileSync(path);
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  let offset = 2; // past the JPEG SOI marker
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  throw new Error(`cannot read image dimensions: ${path}`);
}
const dimensionReport = [];
for (const name of EXPECTED_SHOTS) {
  const { width, height } = imageDimensions(join(outputDir, 'screenshots', name));
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  if (long > 1280 || short < 480) {
    throw new Error(`screenshot dimensions out of bounds: ${name} is ${width}x${height} (long side <= 1280, short side >= 480)`);
  }
  dimensionReport.push(`${name} ${width}x${height}`);
}
console.log(`screenshot dimensions verified: ${dimensionReport.join(' · ')}`);

// Report the dossier's contents: what the judge will actually read,
// section by section, so a hand-in that silently lost a part of the
// game (a source file, a screenshot's bytes) shows up in this log.
const dossier = JSON.parse(readFileSync(join(outputDir, 'dossier.json'), 'utf8'));
const dossierSections = Object.entries(dossier)
  .map(([key, value]) => `${key}: ${Array.isArray(value) ? `${value.length} entries` : typeof value}`)
  .join(' · ');
console.log(`dossier contents: ${dossierSections}`);

// A closing summary a human can skim: what was handed in, how much of
// each platform allowance it uses, and where it landed. Log only —
// the dossier bytes above are untouched by anything printed here.
const gameFiles = outFiles.filter((file) => file.includes(`${join(outputDir, 'game')}`)).length;
const shotFiles = outFiles.filter((file) => file.includes(`${join(outputDir, 'screenshots')}`)).length;
const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;
console.log(`starlane-courier: ${outFiles.length} files, ${outBytes} bytes -> ${outputDir}`);
console.log(
  `  hand-in: game/ ${gameFiles} files · screenshots/ ${shotFiles} files · dossier.json ${kib(statSync(join(outputDir, 'dossier.json')).size)}`
  + ` · total ${kib(outBytes)} of ${MAX_TOTAL_BYTES / (1024 * 1024)} MiB (${outFiles.length}/${MAX_ENTRIES} entries)`,
);
