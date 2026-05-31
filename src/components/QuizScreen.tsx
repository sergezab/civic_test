import { useEffect, useMemo, useState } from "react";
import type { Question } from "../data/questions";
import type { UseSpeech } from "../hooks/useSpeech";
import { buildChoices, LETTERS } from "../utils/quiz";
import { setUrlParams } from "../utils/url";
import { ProgressDots } from "./ProgressDots";
import { AnswerReveal } from "./AnswerReveal";

interface QuizScreenProps {
  question: Question;
  index: number;
  total: number;
  results: (boolean | null)[];
  speech: UseSpeech;
  isBookmarked: (id: number) => boolean;
  onToggleBookmark: (id: number) => void;
  onNext: (correct: boolean) => void;
}

type Stage = "ask" | "choosing" | "answered";

export function QuizScreen({
  question,
  index,
  total,
  results,
  speech,
  isBookmarked,
  onToggleBookmark,
  onNext,
}: QuizScreenProps) {
  const choices = useMemo(() => buildChoices(question), [question]);
  const [stage, setStage] = useState<Stage>("ask");
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    speech.playOnce(`q-${question.id}`, question.id, question.question);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id]);

  // Keep URL stage param in sync so bug reports capture the exact state.
  useEffect(() => {
    setUrlParams({ stage });
  }, [stage]);

  const isSpoken = question.type === "spoken";
  const bookmarked = isBookmarked(question.id);

  const pick = (i: number) => {
    setSelected(i);
    setStage("answered");
  };

  const selectedCorrect =
    selected !== null && choices[selected]?.correct === true;

  return (
    <div className="screen quiz-screen">
      <div className="question-bar">
        <div className="question-meta">
          {question.senior && (
            <span className="senior-badge" title="Part of the 65/20 study set">
              ★ 65/20
            </span>
          )}
          <button
            className={`bookmark-btn${bookmarked ? " is-bookmarked" : ""}`}
            onClick={() => onToggleBookmark(question.id)}
            title={bookmarked ? "Remove from saved" : "Save for later"}
            aria-pressed={bookmarked}
            aria-label={bookmarked ? "Remove from saved" : "Save for later"}
          >
            {bookmarked ? "★" : "☆"}
          </button>
        </div>
        <h2 className="question-text">{question.question}</h2>
      </div>

      {speech.supported && (
        <button
          className="repeat-btn"
          onClick={() => speech.play(question.id, question.question)}
        >
          {speech.speaking ? "🔊 Playing…" : "↻ Repeat the question"}
        </button>
      )}

      <div className="answer-area">
        {stage === "ask" && (
          <div className="practice-card">
            <p>Practice saying the answer out loud.</p>
          </div>
        )}

        {stage === "choosing" && !isSpoken && (
          <ul className="choices">
            {choices.map((c, i) => (
              <li key={i}>
                <button className="choice" onClick={() => pick(i)}>
                  <span className="choice-letter">{LETTERS[i]}</span>
                  <span className="choice-text">{c.text}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {stage === "answered" && !isSpoken && (
          <>
            <ul className="choices">
              {choices.map((c, i) => {
                const state = c.correct
                  ? "correct"
                  : i === selected
                    ? "wrong"
                    : "muted";
                return (
                  <li key={i}>
                    <div className={`choice is-result choice-${state}`}>
                      <span className="choice-letter">
                        {c.correct ? "✓" : i === selected ? "✕" : LETTERS[i]}
                      </span>
                      <span className="choice-text">{c.text}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
            <AnswerReveal question={question} />
          </>
        )}

        {stage === "answered" && isSpoken && (
          <AnswerReveal question={question} spoken />
        )}
      </div>

      <div className="footer-bar">
        {stage === "ask" && (
          <button
            className="btn btn-primary btn-wide"
            onClick={() => setStage(isSpoken ? "answered" : "choosing")}
          >
            {isSpoken ? "Show the answer" : "Select your answer"}
          </button>
        )}

        {stage === "choosing" && (
          <p className="footer-hint">Choose the answer you said out loud.</p>
        )}

        {stage === "answered" && !isSpoken && (
          <button
            className={`btn btn-wide ${selectedCorrect ? "btn-correct" : "btn-primary"}`}
            onClick={() => onNext(selectedCorrect)}
          >
            {selectedCorrect ? "Correct! Next question" : "Next question"}
          </button>
        )}

        {stage === "answered" && isSpoken && (
          <div className="self-assess">
            <button className="btn btn-correct" onClick={() => onNext(true)}>
              I answered correctly
            </button>
            <button className="btn btn-ghost" onClick={() => onNext(false)}>
              I need more practice
            </button>
          </div>
        )}
      </div>

      <ProgressDots total={total} current={index} results={results} />
    </div>
  );
}
