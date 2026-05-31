// Pre-generates spoken-question audio with the built-in macOS `say` voice and
// converts it to browser-friendly AAC/.m4a via `afconvert`. Output lands in
// public/audio/q-<id>.m4a so the app can play reliable static files instead of
// depending on the browser's flaky Web Speech engine.
//
// Usage:
//   node scripts/generate-audio.mjs           # only generate missing files
//   node scripts/generate-audio.mjs --force   # regenerate everything
//
// Requires macOS (say + afconvert ship with the OS). Node >= 22.18 / 23.6
// (imports the .ts data module via built-in type stripping).

import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { questions } from "../src/data/questions.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const outDir = join(root, "public", "audio");
const tmpDir = join(root, ".audio-tmp");

const VOICE = "Samantha"; // clear US English voice bundled with macOS
const RATE = "165"; // words per minute — a touch slower for clarity
const force = process.argv.includes("--force");

mkdirSync(outDir, { recursive: true });
mkdirSync(tmpDir, { recursive: true });

let made = 0;
for (const q of questions) {
  const m4a = join(outDir, `q-${q.id}.m4a`);
  if (existsSync(m4a) && !force) continue;

  const aiff = join(tmpDir, `q-${q.id}.aiff`);
  execFileSync("say", ["-v", VOICE, "-r", RATE, "-o", aiff, q.question]);
  execFileSync("afconvert", [aiff, m4a, "-f", "m4af", "-d", "aac"]);
  made++;
  process.stdout.write(`\r  generated ${made} file(s)…`);
}

rmSync(tmpDir, { recursive: true, force: true });
console.log(
  `\nDone. ${made} new file(s); public/audio now covers ${questions.length} questions.`,
);
