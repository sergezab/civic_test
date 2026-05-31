import type { Mode } from "./StartScreen";

interface ResultsScreenProps {
  score: number;
  total: number;
  mode: Mode;
  bookmarkCount: number;
  onRetry: () => void;
  onHome: () => void;
  onStudyBookmarks: () => void;
}

export function ResultsScreen({
  score,
  total,
  mode,
  bookmarkCount,
  onRetry,
  onHome,
  onStudyBookmarks,
}: ResultsScreenProps) {
  const threshold = mode === "test" ? 6 : Math.ceil(total * 0.6);
  const passed = score >= threshold;
  const pct = Math.round((score / total) * 100);

  return (
    <div className="screen results-screen">
      <p className="eyebrow">{mode === "test" ? "Test complete" : "Practice complete"}</p>
      <div className={`result-medallion ${passed ? "is-pass" : "is-fail"}`}>
        <span className="result-score">{score}</span>
        <span className="result-of">/ {total}</span>
      </div>

      <h1 className="result-title">{passed ? "You passed! 🎉" : "Keep studying"}</h1>
      <p className="result-detail">
        {mode === "test"
          ? `You need 6 of 10 correct to pass the civics test. You scored ${score} (${pct}%).`
          : `You scored ${score} of ${total} (${pct}%) across the question set.`}
      </p>

      <div className="start-actions">
        <button className="btn btn-primary" onClick={onRetry}>
          {mode === "test" ? "Take another test" : "Practice again"}
        </button>
        {bookmarkCount > 0 && (
          <button className="btn btn-ghost" onClick={onStudyBookmarks}>
            ☆ Review {bookmarkCount} saved question{bookmarkCount === 1 ? "" : "s"}
          </button>
        )}
        <button className="btn btn-ghost" onClick={onHome}>
          Back to start
        </button>
      </div>
    </div>
  );
}
