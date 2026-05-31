// Client for the civics interview backend (FastAPI). Base URL comes from
// VITE_INTERVIEW_API_URL; defaults to the local dev server. If the server is
// unreachable, Interview mode degrades gracefully and Quiz/Flash keep working.

import { ilog, now, since } from "../utils/log";

// Default: relative (same-origin) so calls go through the Vite dev proxy (or a
// production reverse proxy) — one secure origin, no CORS, no mixed content when
// served over HTTPS. Override with VITE_INTERVIEW_API_URL to hit the backend directly.
const RAW_BASE = import.meta.env.VITE_INTERVIEW_API_URL || "";
export const INTERVIEW_API_BASE = RAW_BASE.replace(/\/$/, "");

export type Verdict = "correct" | "partial" | "incorrect";

export interface GradeResult {
  verdict: Verdict;
  feedback: string;
  correctAnswer: string;
  heard: string;
  model: string | null;
  fallback: boolean;
}

const VERDICTS = new Set<Verdict>(["correct", "partial", "incorrect"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseGradeResult(data: unknown): GradeResult {
  if (!isRecord(data)) {
    throw new Error("grade response was not an object");
  }

  const { verdict, feedback, correctAnswer, heard, model, fallback } = data;
  if (typeof verdict !== "string" || !VERDICTS.has(verdict as Verdict)) {
    throw new Error("grade response had an invalid verdict");
  }
  if (
    typeof feedback !== "string" ||
    typeof correctAnswer !== "string" ||
    typeof heard !== "string" ||
    (model !== null && typeof model !== "string") ||
    typeof fallback !== "boolean"
  ) {
    throw new Error("grade response shape did not match the API contract");
  }

  return {
    verdict: verdict as Verdict,
    feedback,
    correctAnswer,
    heard,
    model,
    fallback,
  };
}

function parseSttResponse(data: unknown): string {
  if (!isRecord(data) || (data.text !== undefined && typeof data.text !== "string")) {
    throw new Error("stt response shape did not match the API contract");
  }
  return data.text ?? "";
}

export async function checkHealth(signal?: AbortSignal): Promise<boolean> {
  try {
    const r = await fetch(`${INTERVIEW_API_BASE}/health`, { signal });
    return r.ok;
  } catch {
    return false;
  }
}

export async function gradeAnswer(
  question: string,
  acceptedAnswers: string[],
  transcript: string,
  questionId?: number,
): Promise<GradeResult> {
  const t0 = now();
  ilog("api", "POST /grade", { q: questionId, chars: transcript.length });
  const r = await fetch(`${INTERVIEW_API_BASE}/grade`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, acceptedAnswers, transcript, questionId }),
  });
  if (!r.ok) {
    ilog("api", "/grade FAILED", { q: questionId, status: r.status, ms: since(t0) });
    throw new Error(`grade request failed (${r.status})`);
  }
  const data = parseGradeResult(await r.json());
  ilog("api", "/grade done", {
    q: questionId,
    ms: since(t0),
    verdict: data.verdict,
    fallback: data.fallback,
    model: data.model ?? "—",
  });
  return data;
}

// Server-side STT (faster-whisper) for browsers without the Web Speech API.
export async function transcribeAudio(blob: Blob): Promise<string> {
  const ext = blob.type.includes("ogg")
    ? "ogg"
    : blob.type.includes("mp4") || blob.type.includes("mpeg")
      ? "mp4"
      : "webm";
  const form = new FormData();
  form.append("file", blob, `answer.${ext}`);
  const t0 = now();
  ilog("api", "POST /stt", { bytes: blob.size, type: blob.type });
  const r = await fetch(`${INTERVIEW_API_BASE}/stt`, { method: "POST", body: form });
  if (!r.ok) throw new Error(`stt request failed (${r.status})`);
  const text = parseSttResponse(await r.json());
  ilog("api", "/stt done", { ms: since(t0), chars: text.length });
  return text;
}

// /tts (Piper) for spoken feedback. Returns a playable object URL, or null if
// TTS is unavailable so callers can fall back to text.
export async function synthesizeSpeech(text: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000); // never let TTS hang the loop
  const t0 = now();
  try {
    const r = await fetch(`${INTERVIEW_API_BASE}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      ilog("api", "/tts unavailable", { status: r.status, ms: since(t0) });
      return null;
    }
    const blob = await r.blob();
    ilog("api", "/tts done", { ms: since(t0), bytes: blob.size });
    return URL.createObjectURL(blob);
  } catch {
    ilog("api", "/tts error/timeout", { ms: since(t0) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
