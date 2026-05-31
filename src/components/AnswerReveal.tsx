import type { Question } from "../data/questions";

interface AnswerRevealProps {
  question: Question;
  /** Show the spoken-question guidance text (for "answers vary" cards). */
  spoken?: boolean;
}

export function AnswerReveal({ question, spoken = false }: AnswerRevealProps) {
  return (
    <div className="reveal">
      {spoken && question.guidance && (
        <p className="reveal-guidance">{question.guidance}</p>
      )}
      <p className="reveal-label">
        Accepted answer{question.acceptableAnswers.length > 1 ? "s" : ""} · 2008
        USCIS list
      </p>
      <ul className="reveal-answers">
        {question.acceptableAnswers.map((a, i) => (
          <li key={i}>{a}</li>
        ))}
      </ul>
      {question.note && <p className="reveal-note">{question.note}</p>}
    </div>
  );
}
