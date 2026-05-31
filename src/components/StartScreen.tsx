import { useState } from "react";

export type Pool = "all" | "senior" | "bookmarks";
export type Mode = "test" | "practice";
export type Format = "quiz" | "flash";

export interface QuizConfig {
  pool: Pool;
  mode: Mode;
  format: Format;
}

interface StartScreenProps {
  onStart: (config: QuizConfig, startId?: number) => void;
  speechSupported: boolean;
  bookmarkCount: number;
}

export function StartScreen({ onStart, speechSupported, bookmarkCount }: StartScreenProps) {
  const [pool, setPool] = useState<Pool>("all");
  const [format, setFormat] = useState<Format>("quiz");

  const isFlash = format === "flash";
  const isBookmarks = pool === "bookmarks";
  const noBookmarks = isBookmarks && bookmarkCount === 0;

  const start = (mode: Mode) => onStart({ pool, mode, format });

  return (
    <div className="screen start-screen">
      <p className="eyebrow">USCIS · 2008 civics test</p>
      <h1 className="start-title">Practice for the U.S. citizenship test</h1>
      <p className="start-lede">
        The officer asks up to 10 of the 100 civics questions out loud. Answer 6
        correctly to pass. Listen to each question, say your answer aloud, then
        check yourself against the official answer.
      </p>

      <div className="pool-toggle" role="group" aria-label="Study format">
        <button
          className={!isFlash ? "is-active" : ""}
          onClick={() => setFormat("quiz")}
        >
          Quiz
        </button>
        <button
          className={isFlash ? "is-active" : ""}
          onClick={() => setFormat("flash")}
        >
          Flash cards
        </button>
      </div>
      <p className="pool-note">
        {isFlash
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

      <div className="start-actions">
        <button
          className="btn btn-primary"
          onClick={() => start("test")}
          disabled={noBookmarks}
        >
          {isFlash ? "Study 10 cards" : "Start 10-question test"}
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => start("practice")}
          disabled={noBookmarks}
        >
          {isFlash ? "Flip through all" : "Practice every question"}
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
