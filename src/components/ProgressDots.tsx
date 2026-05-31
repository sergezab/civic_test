interface ProgressDotsProps {
  total: number;
  current: number;
  results: (boolean | null)[];
}

export function ProgressDots({ total, current, results }: ProgressDotsProps) {
  return (
    <div className="progress">
      <span className="progress-label">
        Question {current + 1} of {total}
      </span>
      <div className="progress-dots">
        {Array.from({ length: total }).map((_, i) => {
          const result = results[i];
          let state = "pending";
          if (i === current) state = "current";
          if (result === true) state = "correct";
          else if (result === false) state = "incorrect";
          return (
            <span key={i} className={`dot dot-${state}`} aria-hidden="true">
              {result === true ? "✓" : result === false ? "✕" : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}
