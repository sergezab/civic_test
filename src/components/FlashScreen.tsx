import { useEffect, useState } from "react";
import type { Question } from "../data/questions";
import type { UseSpeech } from "../hooks/useSpeech";
import { setUrlParams } from "../utils/url";
import { AnswerReveal } from "./AnswerReveal";

interface FlashScreenProps {
  cards: Question[];
  speech: UseSpeech;
  isBookmarked: (id: number) => boolean;
  onToggleBookmark: (id: number) => void;
  onRestart: () => void;
  onHome: () => void;
}

export function FlashScreen({
  cards,
  speech,
  isBookmarked,
  onToggleBookmark,
  onRestart,
  onHome,
}: FlashScreenProps) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(false);

  // Reset when a fresh set is dealt (e.g. "study again" re-shuffles `cards`).
  useEffect(() => {
    setIndex(0);
    setFlipped(false);
    setDone(false);
  }, [cards]);

  const card = cards[index];

  // Read each new card aloud.
  useEffect(() => {
    if (card) speech.playOnce(`flash-${card.id}`, card.id, card.question);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id]);

  // Keep URL in sync for sharing / bug reports.
  useEffect(() => {
    if (card) {
      setUrlParams({ q: String(card.id), stage: flipped ? "back" : "front" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id, flipped]);

  if (done) {
    return (
      <div className="screen results-screen">
        <p className="eyebrow">Flash cards complete</p>
        <div className="result-medallion is-pass">
          <span className="result-score">{cards.length}</span>
          <span className="result-of">cards</span>
        </div>
        <h1 className="result-title">Nice review! 🎴</h1>
        <p className="result-detail">
          You flipped through {cards.length} card{cards.length === 1 ? "" : "s"}.
        </p>
        <div className="start-actions">
          <button className="btn btn-primary" onClick={onRestart}>
            Shuffle &amp; study again
          </button>
          <button className="btn btn-ghost" onClick={onHome}>
            Back to start
          </button>
        </div>
      </div>
    );
  }

  if (!card) return null;

  const bookmarked = isBookmarked(card.id);

  const goNext = () => {
    speech.stop();
    if (index + 1 >= cards.length) {
      setDone(true);
      return;
    }
    setIndex(index + 1);
    setFlipped(false);
  };

  const goPrev = () => {
    if (index === 0) return;
    speech.stop();
    setIndex(index - 1);
    setFlipped(false);
  };

  const isLast = index + 1 >= cards.length;

  return (
    <div className="screen quiz-screen">
      <div className="question-bar">
        <div className="question-meta">
          {card.senior && (
            <span className="senior-badge" title="Part of the 65/20 study set">
              ★ 65/20
            </span>
          )}
          <button
            className={`bookmark-btn${bookmarked ? " is-bookmarked" : ""}`}
            onClick={() => onToggleBookmark(card.id)}
            title={bookmarked ? "Remove from saved" : "Save for later"}
            aria-pressed={bookmarked}
          >
            {bookmarked ? "★" : "☆"}
          </button>
        </div>
        <h2 className="question-text">{card.question}</h2>
      </div>

      {speech.supported && (
        <button
          className="repeat-btn"
          onClick={() => speech.play(card.id, card.question)}
        >
          {speech.speaking ? "🔊 Playing…" : "↻ Repeat the question"}
        </button>
      )}

      <div className="answer-area">
        {!flipped ? (
          <div className="practice-card">
            <p>Recall the answer out loud, then flip the card.</p>
          </div>
        ) : (
          <>
            {card.type === "choice" && card.correct && (
              <div className="flash-answer">{card.correct}</div>
            )}
            <AnswerReveal question={card} spoken={card.type === "spoken"} />
          </>
        )}
      </div>

      <div className="footer-bar">
        {!flipped ? (
          <div className="flash-footer-actions">
            <button
              className="btn btn-primary"
              onClick={() => setFlipped(true)}
            >
              Show the answer
            </button>
            <button className="btn btn-ghost" onClick={goNext}>
              {isLast ? "Skip & finish" : "Skip →"}
            </button>
          </div>
        ) : (
          <button className="btn btn-primary btn-wide" onClick={goNext}>
            {isLast ? "Finish" : "Next card"}
          </button>
        )}
      </div>

      <div className="flash-nav">
        <button className="flash-nav-btn" onClick={goPrev} disabled={index === 0}>
          ← Previous
        </button>
        <span className="progress-label">
          Card {index + 1} of {cards.length}
        </span>
        <button className="flash-nav-btn" onClick={goNext}>
          {isLast ? "Finish" : "Skip →"}
        </button>
      </div>
      <div className="flash-bar">
        <div
          className="flash-bar-fill"
          style={{ width: `${((index + 1) / cards.length) * 100}%` }}
        />
      </div>
    </div>
  );
}
