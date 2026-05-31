// Pre-generates spoken-question audio and converts it to browser-friendly
// AAC/.m4a via `afconvert`. Output lands in public/audio/q-<id>.m4a so the app
// plays reliable static files instead of the browser's flaky Web Speech engine.
//
// Voice: Piper (en_US-lessac-medium) — the same natural voice the interview
// officer uses for feedback, so questions don't sound robotic. Falls back to the
// macOS `say` voice only if Piper isn't available.
//
// Usage:
//   node scripts/generate-audio.mjs           # only generate missing files
//   node scripts/generate-audio.mjs --force   # regenerate everything
//
// Requires macOS `afconvert`. Piper comes from the server venv (server/.venv +
// server/voices/*.onnx). Node >= 22.18 / 23.6 (imports the .ts data module).

import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { questions } from "../src/data/questions.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const outDir = join(root, "public", "audio");
const tmpDir = join(root, ".audio-tmp");
const force = process.argv.includes("--force");

// Piper (preferred, natural). Override via PIPER_PY / PIPER_VOICE env if needed.
const PIPER_PY = process.env.PIPER_PY || join(root, "server", ".venv", "bin", "python");
const PIPER_VOICE =
  process.env.PIPER_VOICE ||
  join(root, "server", "voices", "en_US-lessac-medium.onnx");
const usePiper = existsSync(PIPER_PY) && existsSync(PIPER_VOICE);

if (usePiper) {
  console.log(`Voice: Piper (${PIPER_VOICE.split("/").pop()})`);
} else {
  console.log("Voice: macOS `say` (Piper not found — run server setup for the natural voice)");
}

mkdirSync(outDir, { recursive: true });
mkdirSync(tmpDir, { recursive: true });

function synthWav(text, wavPath) {
  if (usePiper) {
    execFileSync(PIPER_PY, ["-m", "piper", "-m", PIPER_VOICE, "-f", wavPath], {
      input: text,
    });
  } else {
    const aiff = wavPath.replace(/\.wav$/, ".aiff");
    execFileSync("say", ["-v", "Samantha", "-r", "165", "-o", aiff, text]);
    execFileSync("afconvert", [aiff, wavPath, "-f", "WAVE", "-d", "LEI16"]);
    rmSync(aiff, { force: true });
  }
}

let made = 0;
for (const q of questions) {
  const m4a = join(outDir, `q-${q.id}.m4a`);
  if (existsSync(m4a) && !force) continue;

  const wav = join(tmpDir, `q-${q.id}.wav`);
  synthWav(q.question, wav);
  execFileSync("afconvert", [wav, m4a, "-f", "m4af", "-d", "aac"]);
  rmSync(wav, { force: true });
  made++;
  process.stdout.write(`\r  generated ${made} file(s)…`);
}

rmSync(tmpDir, { recursive: true, force: true });
console.log(
  `\nDone. ${made} file(s); public/audio now covers ${questions.length} questions.`,
);
