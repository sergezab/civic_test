import { useMemo, useState } from "react";

export type Pool = "all" | "senior" | "bookmarks";
export type Mode = "test" | "practice";
export type Format = "quiz" | "flash" | "interview";

export interface QuizConfig {
  pool: Pool;
  mode: Mode;
  format: Format;
  /** Number of questions for a `test` run. Ignored for `practice`. */
  count?: number;
}

interface StartScreenProps {
  onStart: (config: QuizConfig, startId?: number) => void;
  speechSupported: boolean;
  bookmarkCount: number;
}

// Sizes of the fixed pools (the variable "bookmarks" pool uses bookmarkCount).
const SENIOR_COUNT = 20;
const TOTAL_COUNT = 100;
// Offered test lengths; the current pool's full size is always appended so you
// can run the whole set, and any length larger than the pool is dropped.
const BASE_COUNTS = [10, 25, 50, 100];

export function StartScreen({ onStart, speechSupported, bookmarkCount }: StartScreenProps) {
  const [pool, setPool] = useState<Pool>("all");
  const [format, setFormat] = useState<Format>("quiz");
  // The user's preferred length. It's reconciled against the current pool's
  // available options below, so switching pools never loses the preference.
  const [preferredCount, setPreferredCount] = useState(10);

  const isFlash = format === "flash";
  const isInterview = format === "interview";
  const isBookmarks = pool === "bookmarks";
  const noBookmarks = isBookmarks && bookmarkCount === 0;

  const poolSize =
    pool === "senior" ? SENIOR_COUNT : pool === "bookmarks" ? bookmarkCount : TOTAL_COUNT;

  const countOptions = useMemo(() => {
    const opts = BASE_COUNTS.filter((n) => n < poolSize);
    if (poolSize > 0) opts.push(poolSize); // full-pool option
    return Array.from(new Set(opts)).sort((a, b) => a - b);
  }, [poolSize]);

  // Effective length: the preference if it fits this pool, else 10 (or the
  // largest available). Derived during render — no effect, no stale state.
  const count = countOptions.includes(preferredCount)
    ? preferredCount
    : countOptions.includes(10)
      ? 10
      : (countOptions[countOptions.length - 1] ?? 10);

  const start = (mode: Mode) => onStart({ pool, mode, format, count });

  return (
    <div className="screen start-screen">
      <p className="eyebrow">USCIS · 2008 civics test</p>
      <h1 className="start-title">Practice for the U.S. citizenship test</h1>
      <p className="start-lede">
        The officer asks up to 10 of the 100 civics questions out loud. Answer 6
        correctly to pass. Listen to each question, say your answer aloud, then
        check yourself against the official answer.
      </p>

      <div className="pool-toggle format-toggle" role="group" aria-label="Study format">
        <button
          className={format === "quiz" ? "is-active" : ""}
          onClick={() => setFormat("quiz")}
        >
          Quiz
        </button>
        <button
          className={format === "flash" ? "is-active" : ""}
          onClick={() => setFormat("flash")}
        >
          Flash cards
        </button>
        <button
          className={format === "interview" ? "is-active" : ""}
          onClick={() => setFormat("interview")}
        >
          🎤 Interview
        </button>
      </div>
      <p className="pool-note">
        {isInterview
          ? "Speak your answers to an AI USCIS officer that grades them and replies with spoken feedback — the closest practice to the real oral test."
          : isFlash
            ? "Hear the question, recall the answer, then flip the card to check it. No multiple choice, no scoring."
            : "Hear the question, choose A–D, and see the official answer with feedback."}
      </p>

      <div className="pool-toggle" role="group" aria-label="Question set">
        <button
          className={pool === "all" ? "is-active" : ""}
          onClick={() => setPool("all")}
        >
          All 100
        </button>
        <button
          className={pool === "senior" ? "is-active" : ""}
          onClick={() => setPool("senior")}
        >
          65/20 set (20)
        </button>
        <button
          className={pool === "bookmarks" ? "is-active" : ""}
          onClick={() => setPool("bookmarks")}
        >
          ☆ Saved ({bookmarkCount})
        </button>
      </div>
      <p className="pool-note">
        {isBookmarks
          ? bookmarkCount === 0
            ? "Bookmark questions with the ☆ button while studying to review them here."
            : `${bookmarkCount} saved question${bookmarkCount === 1 ? "" : "s"} queued for review.`
          : pool === "senior"
            ? "The 20 starred questions for applicants 65+ with 20+ years as a permanent resident."
            : "The full pool of 100 civics questions."}
      </p>

      {countOptions.length > 1 && (
        <>
          <div className="pool-toggle count-toggle" role="group" aria-label="Number of questions">
            {countOptions.map((n) => (
              <button
                key={n}
                className={count === n ? "is-active" : ""}
                onClick={() => setPreferredCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="pool-note">
            {count === poolSize
              ? `All ${poolSize} question${poolSize === 1 ? "" : "s"} in this set, shuffled.`
              : `${count} question${count === 1 ? "" : "s"} drawn at random from the ${poolSize}.`}
          </p>
        </>
      )}

      <div className="start-actions">
        <button
          className="btn btn-primary"
          onClick={() => start("test")}
          disabled={noBookmarks}
        >
          {isInterview
            ? `Start ${count}-question interview`
            : isFlash
              ? `Study ${count} cards`
              : `Start ${count}-question test`}
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => start("practice")}
          disabled={noBookmarks}
        >
          {isInterview
            ? "Practice (no pressure)"
            : isFlash
              ? "Flip through all"
              : "Practice every question"}
        </button>
      </div>

      {!speechSupported && (
        <p className="audio-warn">
          Your browser doesn't support spoken audio, so questions will be
          text-only. Try Chrome, Edge, or Safari for the read-aloud feature.
        </p>
      )}
    </div>
  );
}
