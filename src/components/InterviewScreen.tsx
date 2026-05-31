import { useCallback, useEffect, useRef, useState } from "react";
import type { Question } from "../data/questions";
import type { UseSpeech } from "../hooks/useSpeech";
import type { Mode } from "./StartScreen";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { useRecorder } from "../hooks/useRecorder";
import {
  checkHealth,
  gradeAnswer,
  synthesizeSpeech,
  transcribeAudio,
  type GradeResult,
  type Verdict,
} from "../api/interview";

interface InterviewScreenProps {
  questions: Question[];
  mode: Mode;
  speech: UseSpeech;
  isBookmarked: (id: number) => boolean;
  onToggleBookmark: (id: number) => void;
  onRestart: () => void;
  onHome: () => void;
}

type Stage =
  | "ready"
  | "recording"
  | "rec-audio"
  | "transcribing"
  | "edit"
  | "grading"
  | "result";
type Server = "checking" | "ok" | "down";

interface LogEntry {
  id: number;
  question: string;
  heard: string;
  verdict: Verdict;
  correctAnswer: string;
  feedback: string;
}

const PASS_MARK = 6; // USCIS: 6 of 10 correct
const VERDICT_ICON: Record<Verdict, string> = {
  correct: "✓",
  partial: "≈",
  incorrect: "✕",
};

export function InterviewScreen({
  questions,
  mode,
  speech,
  isBookmarked,
  onToggleBookmark,
  onRestart,
  onHome,
}: InterviewScreenProps) {
  const rec = useSpeechRecognition();
  const recorder = useRecorder();
  const canRecord = !rec.supported && recorder.supported;
  const [server, setServer] = useState<Server>("checking");
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<Stage>(rec.supported ? "ready" : "edit");
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<GradeResult | null>(null);
  const [netError, setNetError] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [done, setDone] = useState(false);
  const [deck, setDeck] = useState<Question[]>(questions);
  const fbAudioRef = useRef<HTMLAudioElement | null>(null);

  const q = deck[index];

  const resetTo = (qs: Question[]) => {
    setDeck(qs);
    setIndex(0);
    setLog([]);
    setDone(false);
    setResult(null);
    setAnswer("");
    setNetError(null);
    setStage(rec.supported ? "ready" : "edit");
  };

  // A fresh session was dealt (e.g. "New interview") → reset to its first question.
  useEffect(() => {
    resetTo(questions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions]);

  // Check the grader is reachable.
  useEffect(() => {
    const ctrl = new AbortController();
    checkHealth(ctrl.signal).then((ok) => setServer(ok ? "ok" : "down"));
    return () => ctrl.abort();
  }, []);

  // Read each question aloud.
  useEffect(() => {
    if (q && server === "ok") speech.playOnce(`iv-${q.id}`, q.id, q.question);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q?.id, server]);

  // When recording ends, move to the editable transcript.
  useEffect(() => {
    if (stage === "recording" && !rec.listening) {
      setAnswer(rec.transcript);
      setStage("edit");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.listening]);

  const stopFeedbackAudio = useCallback(() => {
    if (fbAudioRef.current) {
      fbAudioRef.current.pause();
      fbAudioRef.current = null;
    }
  }, []);

  const playFeedback = useCallback(
    async (text: string) => {
      speech.stop();
      const url = await synthesizeSpeech(text);
      if (!url) return; // no TTS yet → text feedback only
      stopFeedbackAudio();
      const audio = new Audio(url);
      fbAudioRef.current = audio;
      audio.onended = () => URL.revokeObjectURL(url);
      audio.play().catch(() => URL.revokeObjectURL(url));
    },
    [speech, stopFeedbackAudio],
  );

  useEffect(() => () => stopFeedbackAudio(), [stopFeedbackAudio]);

  if (!q) return null;

  const startRecording = () => {
    setNetError(null);
    rec.reset();
    setAnswer("");
    rec.start();
    setStage("recording");
  };

  const startAudioRecording = async () => {
    setNetError(null);
    setAnswer("");
    const ok = await recorder.start();
    if (ok) setStage("rec-audio");
    else setNetError("Couldn't access the microphone — type your answer instead.");
  };

  const stopAudioRecording = async () => {
    const blob = await recorder.stop();
    if (!blob) {
      setStage("edit");
      return;
    }
    setStage("transcribing");
    try {
      setAnswer(await transcribeAudio(blob));
    } catch {
      setNetError("Transcription failed — type your answer instead.");
    }
    setStage("edit");
  };

  const submit = async () => {
    const text = answer.trim();
    if (!text) return;
    speech.stop();
    setStage("grading");
    setNetError(null);
    try {
      const res = await gradeAnswer(q.question, q.acceptableAnswers, text, q.id);
      setResult(res);
      setStage("result");
      void playFeedback(res.feedback);
    } catch {
      setNetError("Couldn't reach the grader. Check the server and try again.");
      setStage("edit");
    }
  };

  const tryAgain = () => {
    stopFeedbackAudio();
    setResult(null);
    setAnswer("");
    rec.reset();
    setStage(rec.supported ? "ready" : "edit");
  };

  const next = () => {
    if (!result) return;
    stopFeedbackAudio();
    speech.stop();
    const entry: LogEntry = {
      id: q.id,
      question: q.question,
      heard: result.heard,
      verdict: result.verdict,
      correctAnswer: result.correctAnswer,
      feedback: result.feedback,
    };
    const newLog = [...log, entry];
    setLog(newLog);

    const correct = newLog.filter((e) => e.verdict === "correct").length;
    const wrong = newLog.length - correct;
    const reachedEnd = index + 1 >= deck.length;
    const decided =
      mode === "test" && (correct >= PASS_MARK || wrong > deck.length - PASS_MARK);

    setResult(null);
    setAnswer("");
    rec.reset();

    if (reachedEnd || decided) {
      setDone(true);
      return;
    }
    setIndex(index + 1);
    setStage(rec.supported ? "ready" : "edit");
  };

  // ── Server down ───────────────────────────────────────────────
  if (server === "down") {
    return (
      <div className="screen interview-screen">
        <div className="server-down">
          <h2>The interview grader isn’t running</h2>
          <p>
            Interview mode needs the local grading server. Start it, then reload:
          </p>
          <pre>cd server &amp;&amp; uv run uvicorn app:app --port 8088</pre>
          <p className="muted">
            Quiz and Flash-card modes work without it.
          </p>
          <button className="btn btn-primary" onClick={onHome}>
            Back to start
          </button>
        </div>
      </div>
    );
  }

  // ── Results ───────────────────────────────────────────────────
  if (done) {
    const correct = log.filter((e) => e.verdict === "correct").length;
    const passed = correct >= PASS_MARK;
    const missed = deck.filter((dq) =>
      log.some((e) => e.id === dq.id && e.verdict !== "correct"),
    );
    return (
      <div className="screen results-screen">
        <p className="eyebrow">Interview complete</p>
        <div className={`result-medallion ${passed ? "is-pass" : "is-fail"}`}>
          <span className="result-score">{correct}</span>
          <span className="result-of">/ {log.length}</span>
        </div>
        <h1 className="result-title">
          {mode === "test"
            ? passed
              ? "You passed! 🎉"
              : "Keep practicing"
            : "Practice complete"}
        </h1>
        <p className="result-detail">
          {mode === "test"
            ? `You need ${PASS_MARK} of 10 correct to pass. You answered ${correct} correctly.`
            : `You answered ${correct} of ${log.length} correctly.`}
        </p>

        <div className="transcript-review">
          {log.map((e, i) => (
            <div key={i} className={`tr-row tr-${e.verdict}`}>
              <span className="tr-icon">{VERDICT_ICON[e.verdict]}</span>
              <div className="tr-body">
                <p className="tr-q">{e.question}</p>
                <p className="tr-heard">You said: “{e.heard || "—"}”</p>
                {e.verdict !== "correct" && (
                  <p className="tr-answer">Answer: {e.correctAnswer}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="start-actions">
          {missed.length > 0 && (
            <button className="btn btn-primary" onClick={() => resetTo(missed)}>
              Drill {missed.length} missed
            </button>
          )}
          <button
            className={`btn ${missed.length > 0 ? "btn-ghost" : "btn-primary"}`}
            onClick={onRestart}
          >
            New interview
          </button>
          <button className="btn btn-ghost" onClick={onHome}>
            Back to start
          </button>
        </div>
      </div>
    );
  }

  // ── Active question ───────────────────────────────────────────
  const correctSoFar = log.filter((e) => e.verdict === "correct").length;
  const bookmarked = isBookmarked(q.id);

  return (
    <div className="screen interview-screen">
      <div className="question-bar">
        <div className="question-meta">
          {q.senior && (
            <span className="senior-badge" title="Part of the 65/20 study set">
              ★ 65/20
            </span>
          )}
          <button
            className={`bookmark-btn${bookmarked ? " is-bookmarked" : ""}`}
            onClick={() => onToggleBookmark(q.id)}
            title={bookmarked ? "Remove from saved" : "Save for later"}
            aria-pressed={bookmarked}
          >
            {bookmarked ? "★" : "☆"}
          </button>
        </div>
        <h2 className="question-text">{q.question}</h2>
      </div>

      {speech.supported &&
        (stage === "ready" || stage === "edit" || stage === "result") && (
        <button
          className="repeat-btn"
          onClick={() => speech.play(q.id, q.question)}
        >
          {speech.speaking ? "🔊 Playing…" : "↻ Repeat the question"}
        </button>
      )}

      <div className="answer-area">
        {stage === "ready" && (
          <div className="interview-prompt">
            <p>When you’re ready, answer the officer out loud.</p>
            <p className="privacy-note">
              🔒 Your answer is transcribed and graded to give feedback — audio
              isn’t stored.
            </p>
          </div>
        )}

        {stage === "recording" && (
          <div className="live-transcript" aria-live="polite">
            <span className="rec-dot" /> Listening…
            <p>{rec.transcript || "Speak your answer."}</p>
          </div>
        )}

        {stage === "rec-audio" && (
          <div className="live-transcript" aria-live="polite">
            <span className="rec-dot" /> Recording… speak your answer, then stop.
          </div>
        )}

        {stage === "transcribing" && (
          <div className="interview-prompt grading">
            <span className="rec-dot" /> Transcribing your answer…
          </div>
        )}

        {stage === "edit" && (
          <div className="answer-edit">
            <label htmlFor="answer">Your answer (edit if mis-heard):</label>
            <textarea
              id="answer"
              className="answer-input"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={
                rec.supported
                  ? "Tap the mic above, or type your answer here."
                  : "Type your answer here."
              }
              rows={3}
            />
            {netError && <p className="net-error">{netError}</p>}
          </div>
        )}

        {stage === "grading" && (
          <div className="interview-prompt grading">
            <span className="rec-dot" /> The officer is considering your answer…
          </div>
        )}

        {stage === "result" && result && (
          <div className={`officer-result verdict-${result.verdict}`}>
            <div className="verdict-badge">
              <span className="verdict-icon">{VERDICT_ICON[result.verdict]}</span>
              <span className="verdict-label">{result.verdict}</span>
            </div>
            <p className="officer-feedback">{result.feedback}</p>
            <p className="heard-line">You said: “{result.heard || "—"}”</p>
            {result.verdict !== "correct" && (
              <p className="answer-line">Accepted answer: {result.correctAnswer}</p>
            )}
          </div>
        )}
      </div>

      <div className="footer-bar interview-footer">
        {stage === "ready" && (
          <>
            {rec.supported ? (
              <button className="mic-btn" onClick={startRecording}>
                🎤 Answer out loud
              </button>
            ) : canRecord ? (
              <button className="mic-btn" onClick={startAudioRecording}>
                🎤 Record answer
              </button>
            ) : null}
            <button className="btn btn-ghost" onClick={() => setStage("edit")}>
              {rec.supported || canRecord ? "Type instead" : "Type your answer"}
            </button>
          </>
        )}

        {stage === "recording" && (
          <button className="mic-btn is-recording" onClick={rec.stop}>
            ■ Stop &amp; review
          </button>
        )}

        {stage === "rec-audio" && (
          <button className="mic-btn is-recording" onClick={stopAudioRecording}>
            ■ Stop &amp; transcribe
          </button>
        )}

        {stage === "edit" && (
          <>
            <button
              className="btn btn-primary btn-wide"
              onClick={submit}
              disabled={!answer.trim()}
            >
              Submit answer
            </button>
            {rec.supported ? (
              <button className="btn btn-ghost" onClick={startRecording}>
                🎤 Re-record
              </button>
            ) : canRecord ? (
              <button className="btn btn-ghost" onClick={startAudioRecording}>
                🎤 Re-record
              </button>
            ) : null}
          </>
        )}

        {stage === "result" && (
          <>
            <button
              className={`btn btn-wide ${result?.verdict === "correct" ? "btn-correct" : "btn-primary"}`}
              onClick={next}
            >
              {index + 1 >= deck.length ? "Finish interview" : "Next question"}
            </button>
            <button className="btn btn-ghost" onClick={tryAgain}>
              Try again
            </button>
          </>
        )}
      </div>

      <div className="interview-status">
        <span className="progress-label">
          Question {index + 1} of {deck.length}
        </span>
        <span className="interview-score">✓ {correctSoFar} correct</span>
      </div>
    </div>
  );
}
