import type { Question } from "../data/questions";

export function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sample<T>(arr: readonly T[], n: number): T[] {
  return shuffle(arr).slice(0, n);
}

export interface Choice {
  text: string;
  correct: boolean;
}

/** Build a shuffled A/B/C/D option list for a choice question. */
export function buildChoices(q: Question): Choice[] {
  if (q.type !== "choice" || !q.correct || !q.distractors) return [];
  return shuffle([
    { text: q.correct, correct: true },
    ...q.distractors.map((text) => ({ text, correct: false })),
  ]);
}

export const LETTERS = ["A", "B", "C", "D"] as const;
