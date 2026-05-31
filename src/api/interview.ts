// Client for the civics interview backend (FastAPI). Base URL comes from
// VITE_INTERVIEW_API_URL; defaults to the local dev server. If the server is
// unreachable, Interview mode degrades gracefully and Quiz/Flash keep working.

const RAW_BASE =
  import.meta.env.VITE_INTERVIEW_API_URL || "http://localhost:8088";
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
  const r = await fetch(`${INTERVIEW_API_BASE}/grade`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, acceptedAnswers, transcript, questionId }),
  });
  if (!r.ok) throw new Error(`grade request failed (${r.status})`);
  return (await r.json()) as GradeResult;
}

// Phase 3 wires /tts (Piper) for spoken feedback. Returns a playable object URL,
// or null if TTS is unavailable so callers can fall back to text/browser speech.
export async function synthesizeSpeech(text: string): Promise<string | null> {
  try {
    const r = await fetch(`${INTERVIEW_API_BASE}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!r.ok) return null;
    const blob = await r.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}
