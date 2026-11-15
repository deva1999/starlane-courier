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

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

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
console.log(`starlane-courier: ${outFiles.length} files, ${outBytes} bytes -> ${outputDir}`);
