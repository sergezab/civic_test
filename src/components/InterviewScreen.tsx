import { useCallback, useEffect, useRef, useState } from "react";
import type { Question } from "../data/questions";
import type { UseSpeech } from "../hooks/useSpeech";
import type { Mode } from "./StartScreen";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { useRecorder } from "../hooks/useRecorder";
import { useFeedbackAudio } from "../hooks/useFeedbackAudio";
import {
  ANSWER_TIME_OPTIONS,
  useInterviewPreferences,
  type InterviewMode,
} from "../hooks/useInterviewPreferences";
import { ilog, now, since } from "../utils/log";
import {
  checkHealth,
  gradeAnswer,
  transcribeAudio,
  type GradeResult,
  type Verdict,
} from "../api/interview";

interface InterviewScreenProps {
  questions: Question[];
  mode: Mode; // "test" (early stop, 6/10) | "practice"
  speech: UseSpeech;
  isBookmarked: (id: number) => boolean;
  onToggleBookmark: (id: number) => void;
  onRestart: () => void;
  onHome: () => void;
}

type Stage =
  | "ready"
  | "listening"
  | "rec-audio"
  | "transcribing"
  | "grading"
  | "result"
  | "edit";
type Server = "checking" | "ok" | "down";
/** correct = right on first try; review = right only after a retry; missed = never right. */
type Outcome = "correct" | "review" | "missed";

interface LogEntry {
  id: number;
  question: string;
  heard: string;
  verdict: Verdict;
  correctAnswer: string;
  feedback: string;
  outcome: Outcome;
  attempts: number;
}

/** USCIS pass bar is 6 of 10 (60%); scale it to whatever test length is chosen. */
const passMarkFor = (total: number) => Math.max(1, Math.ceil(total * 0.6));
const SILENCE_MS = 2200; // auto: stop after this much quiet once speech started
const NO_SPEECH_MS = 9000; // auto: give up waiting for any speech
const OUTCOME_ICON: Record<Outcome, string> = {
  correct: "✓",
  review: "↻",
  missed: "✕",
};

const fmtTime = (s: number) =>
  `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;

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
  const { play: playFeedback, stop: stopFeedbackAudio } = useFeedbackAudio(speech.stop);
  const {
    answerSecs,
    interviewMode,
    retry,
    setAnswerSecs,
    setInterviewMode,
    setRetry,
  } = useInterviewPreferences();
  const canRecord = !rec.supported && recorder.supported;
  const autoAvailable = rec.supported; // hands-free needs Web Speech transcripts
  // Mic + speech recognition only work on a secure origin (https or localhost).
  const insecureVoice =
    typeof window !== "undefined" && !window.isSecureContext;

  const auto = interviewMode === "auto" && autoAvailable;
  const [remaining, setRemaining] = useState(answerSecs);

  const [server, setServer] = useState<Server>("checking");
  const [index, setIndex] = useState(0);
  const [deck, setDeck] = useState<Question[]>(questions);
  const [stage, setStage] = useState<Stage>("ready");
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<GradeResult | null>(null);
  const [attempt, setAttempt] = useState(1);
  const [netError, setNetError] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [done, setDone] = useState(false);
  const [autoStarted, setAutoStarted] = useState(false);
  const [paused, setPaused] = useState(false);

  // Refs so delayed callbacks (audio onended, silence timers) read fresh values.
  const lastReadRef = useRef<number | null>(null);
  const autoRef = useRef(auto);
  const pausedRef = useRef(paused);
  const retryRef = useRef(retry);
  const attemptRef = useRef(attempt);
  const logRef = useRef(log);
  const indexRef = useRef(index);
  const deckRef = useRef(deck);
  useEffect(() => void (autoRef.current = auto), [auto]);
  useEffect(() => void (pausedRef.current = paused), [paused]);
  useEffect(() => void (retryRef.current = retry), [retry]);
  useEffect(() => void (attemptRef.current = attempt), [attempt]);
  useEffect(() => void (logRef.current = log), [log]);
  useEffect(() => void (indexRef.current = index), [index]);
  useEffect(() => void (deckRef.current = deck), [deck]);
  const transcriptRef = useRef("");
  useEffect(() => void (transcriptRef.current = rec.transcript), [rec.transcript]);

  const q = deck[index];

  const resetTo = (qs: Question[]) => {
    setDeck(qs);
    setIndex(0);
    setLog([]);
    setDone(false);
    setResult(null);
    setAnswer("");
    setNetError(null);
    setAttempt(1);
    attemptRef.current = 1;
    setStage("ready");
    lastReadRef.current = null;
  };

  // Grader reachability.
  useEffect(() => {
    const ctrl = new AbortController();
    checkHealth(ctrl.signal).then((ok) => setServer(ok ? "ok" : "down"));
    return () => ctrl.abort();
  }, []);

  const beginListening = useCallback(() => {
    if (!autoRef.current || pausedRef.current || !rec.supported) return;
    rec.reset();
    rec.start();
    ilog("iv", "listening", { q: deckRef.current[indexRef.current]?.id, attempt: attemptRef.current });
    setStage("listening");
  }, [rec]);

  // Read each question aloud; in hands-free, then start listening.
  useEffect(() => {
    if (!q || server !== "ok") return;
    if (lastReadRef.current === q.id) return;
    if (auto && !(autoStarted && !paused)) return; // wait for Start / resume
    lastReadRef.current = q.id;
    ilog("iv", "read question", { q: q.id, mode: auto ? "auto" : "manual" });
    if (auto) {
      speech.play(q.id, q.question, beginListening);
    } else {
      speech.play(q.id, q.question);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q?.id, server, auto, autoStarted, paused]);

  // Decide what happens after grading, based on attempt + retry mode.
  const decide = useCallback((res: GradeResult) => {
    const isCorrect = res.verdict === "correct";
    const canRetry = retryRef.current && !isCorrect && attemptRef.current === 1;
    const outcome: Outcome = isCorrect
      ? attemptRef.current === 1
        ? "correct"
        : "review"
      : "missed";
    return { canRetry, outcome };
  }, []);

  const commitOutcome = useCallback(
    (res: GradeResult, outcome: Outcome) => {
      stopFeedbackAudio();
      speech.stop();
      if (rec.listening) rec.stop();
      const cq = deckRef.current[indexRef.current];
      const entry: LogEntry = {
        id: cq.id,
        question: cq.question,
        heard: res.heard,
        verdict: res.verdict,
        correctAnswer: res.correctAnswer,
        feedback: res.feedback,
        outcome,
        attempts: attemptRef.current,
      };
      const newLog = [...logRef.current, entry];
      setLog(newLog);
      setResult(null);
      setAnswer("");
      setNetError(null);
      setAttempt(1);
      attemptRef.current = 1;

      const firstTry = newLog.filter((e) => e.outcome === "correct").length;
      const notFirstTry = newLog.length - firstTry;
      const total = deckRef.current.length;
      const passMark = passMarkFor(total);
      const reachedEnd = indexRef.current + 1 >= total;
      // Real-exam early stop only when not in retry-practice mode: stop once the
      // pass mark is reached, or once it's mathematically unreachable.
      const earlyStop =
        mode === "test" &&
        !retryRef.current &&
        (firstTry >= passMark || notFirstTry > total - passMark);
      if (reachedEnd || earlyStop) {
        ilog("iv", "interview complete", { correct: firstTry, of: newLog.length });
        setDone(true);
        return;
      }
      ilog("iv", "advance", { to: indexRef.current + 2, outcome });
      setStage("ready");
      setIndex(indexRef.current + 1);
    },
    [mode, rec, speech, stopFeedbackAudio],
  );

  const startRetry = useCallback(() => {
    stopFeedbackAudio();
    setResult(null);
    setNetError(null);
    attemptRef.current = 2;
    setAttempt(2);
    rec.reset();
    ilog("iv", "retry", { q: deckRef.current[indexRef.current]?.id });
    if (autoRef.current) beginListening();
    else setStage("ready");
  }, [beginListening, rec, stopFeedbackAudio]);

  const submitText = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      const t0 = now();
      speech.stop();
      if (rec.listening) rec.stop();
      setStage("grading");
      setNetError(null);
      const cq = deckRef.current[indexRef.current];
      ilog("iv", "submit", {
        q: cq.id,
        attempt: attemptRef.current,
        chars: text.length,
        mode: autoRef.current ? "auto" : "manual",
      });
      try {
        const res = await gradeAnswer(cq.question, cq.acceptableAnswers, text, cq.id);
        ilog("iv", "graded", { q: cq.id, ms: since(t0), verdict: res.verdict });
        setResult(res);
        setStage("result");
        const tf = now();
        playFeedback(res.feedback, () => {
          ilog("iv", "feedback done", { q: cq.id, ms: since(tf) });
          if (!autoRef.current || pausedRef.current) return; // manual: buttons drive it
          const { canRetry, outcome } = decide(res);
          if (canRetry) startRetry();
          else commitOutcome(res, outcome);
        });
      } catch {
        ilog("iv", "grade error", { q: cq.id, ms: since(t0) });
        setNetError("Couldn't reach the grader — try again.");
        setStage("ready");
        if (autoRef.current) setPaused(true);
      }
    },
    [commitOutcome, decide, playFeedback, rec, speech, startRetry],
  );

  // Hands-free silence detection: submit after a pause (or give up on silence).
  useEffect(() => {
    if (!auto || stage !== "listening") return;
    const current = rec.transcript;
    const delay = current ? SILENCE_MS : NO_SPEECH_MS;
    const t = window.setTimeout(() => {
      submitText(current);
    }, delay);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, stage, rec.transcript]);

  // Hands-free hard cap: honor the configured time limit even if the speaker
  // never pauses (silence detection above usually fires first). Fixed deadline,
  // so it does NOT reset on transcript changes.
  useEffect(() => {
    if (!auto || stage !== "listening") return;
    const t = window.setTimeout(() => {
      submitText(transcriptRef.current);
    }, answerSecs * 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, stage, answerSecs]);

  // Surface speech-recognition failures (network/not-allowed/audio-capture) so a
  // dead mic isn't silently graded as "I didn't catch the answer".
  useEffect(() => {
    if (rec.error) ilog("iv", "recognition error", { error: rec.error });
  }, [rec.error]);

  // ── Manual controls ───────────────────────────────────────────
  const manualStart = () => {
    setNetError(null);
    rec.reset();
    setAnswer("");
    setRemaining(answerSecs);
    rec.start();
    setStage("listening");
  };
  const manualStopSubmit = useCallback(() => {
    rec.stop();
    submitText(transcriptRef.current);
  }, [rec, submitText]);

  const startAudioRecording = async () => {
    setNetError(null);
    setAnswer("");
    setRemaining(answerSecs);
    const ok = await recorder.start();
    if (ok) setStage("rec-audio");
    else setNetError("Couldn't access the microphone — type your answer instead.");
  };
  const stopAudioRecording = useCallback(async () => {
    const blob = await recorder.stop();
    if (!blob) {
      setStage("ready");
      return;
    }
    setStage("transcribing");
    try {
      submitText(await transcribeAudio(blob));
    } catch {
      setNetError("Transcription failed — type your answer instead.");
      setStage("ready");
    }
  }, [recorder, submitText]);

  // Per-answer countdown — auto-submit when the time limit runs out (manual modes).
  useEffect(() => {
    const counting = (!auto && stage === "listening") || stage === "rec-audio";
    if (!counting) return;
    const deadline = Date.now() + answerSecs * 1000;
    const id = window.setInterval(() => {
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) {
        window.clearInterval(id);
        if (stage === "rec-audio") void stopAudioRecording();
        else manualStopSubmit();
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [auto, stage, answerSecs, manualStopSubmit, stopAudioRecording]);

  // Free redo (re-answer without scoring it as a new attempt).
  const redo = () => {
    stopFeedbackAudio();
    setResult(null);
    setNetError(null);
    rec.reset();
    if (auto) beginListening();
    else setStage("ready");
  };

  const startHandsFree = () => {
    setNetError(null);
    setPaused(false);
    lastReadRef.current = null; // force re-read + listen for current question
    setAutoStarted(true);
  };
  const pauseAuto = () => {
    setPaused(true);
    if (rec.listening) rec.stop();
    stopFeedbackAudio();
    speech.stop();
    setStage("ready");
  };
  const resumeAuto = () => {
    setPaused(false);
    lastReadRef.current = null;
  };

  const switchMode = (next: InterviewMode) => {
    if (next === interviewMode) return;
    if (rec.listening) rec.stop();
    stopFeedbackAudio();
    speech.stop();
    setInterviewMode(next);
    setStage("ready");
    setResult(null);
    if (next === "auto" && autoAvailable) {
      lastReadRef.current = null;
      setPaused(false);
      setAutoStarted(true);
    } else {
      setAutoStarted(false);
    }
  };

  // ── Server down ───────────────────────────────────────────────
  if (server === "down") {
    return (
      <div className="screen interview-screen">
        <div className="server-down">
          <h2>The interview grader isn’t running</h2>
          <p>Interview mode needs the local grading server. Start it, then reload:</p>
          <pre>cd server &amp;&amp; uv run uvicorn app:app --port 8088</pre>
          <p className="muted">Quiz and Flash-card modes work without it.</p>
          <button className="btn btn-primary" onClick={onHome}>
            Back to start
          </button>
        </div>
      </div>
    );
  }

  // ── Results ───────────────────────────────────────────────────
  if (done) {
    const firstTry = log.filter((e) => e.outcome === "correct").length;
    const reviewed = log.filter((e) => e.outcome === "review").length;
    // Test length is the full deck (early stop may end it sooner); practice = asked.
    const total = mode === "test" ? deck.length : log.length;
    const passMark = passMarkFor(total);
    const passed = firstTry >= passMark;
    const toPractice = deck.filter((dq) =>
      log.some((e) => e.id === dq.id && e.outcome !== "correct"),
    );
    return (
      <div className="screen results-screen">
        <p className="eyebrow">Interview complete</p>
        <div className={`result-medallion ${passed ? "is-pass" : "is-fail"}`}>
          <span className="result-score">{firstTry}</span>
          <span className="result-of">/ {total}</span>
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
            ? `You need ${passMark} of ${total} correct to pass. You got ${firstTry} on the first try`
            : `You got ${firstTry} of ${total} on the first try`}
          {reviewed > 0 ? ` (+${reviewed} on a retry).` : "."}
        </p>

        <div className="transcript-review">
          {log.map((e, i) => (
            <div key={i} className={`tr-row tr-${e.outcome}`}>
              <span className="tr-icon">{OUTCOME_ICON[e.outcome]}</span>
              <div className="tr-body">
                <p className="tr-q">{e.question}</p>
                <p className="tr-heard">You said: “{e.heard || "—"}”</p>
                {e.outcome !== "correct" && (
                  <p className="tr-answer">
                    {e.outcome === "review" ? "Got it on retry · " : ""}
                    Answer: {e.correctAnswer}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="start-actions">
          {toPractice.length > 0 && (
            <button className="btn btn-primary" onClick={() => resetTo(toPractice)}>
              Practice {toPractice.length} you missed
            </button>
          )}
          <button
            className={`btn ${toPractice.length > 0 ? "btn-ghost" : "btn-primary"}`}
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
  const correctSoFar = log.filter((e) => e.outcome === "correct").length;
  const bookmarked = isBookmarked(q.id);

  const resultCorrect = result?.verdict === "correct";
  const retryAvailable = retry && !!result && !resultCorrect && attempt === 1;
  const resultOutcome: Outcome = result
    ? resultCorrect
      ? attempt === 1
        ? "correct"
        : "review"
      : "missed"
    : "missed";

  return (
    <div className="screen interview-screen">
      <div className="iv-controls">
        <div className="mode-toggle" role="group" aria-label="Interview mode">
          <button
            className={interviewMode === "manual" ? "is-active" : ""}
            onClick={() => switchMode("manual")}
          >
            ✋ Manual
          </button>
          <button
            className={interviewMode === "auto" ? "is-active" : ""}
            onClick={() => switchMode("auto")}
            disabled={!autoAvailable}
            title={
              autoAvailable
                ? "Reads, listens, grades and advances by itself"
                : "Hands-free needs Chrome/Edge speech recognition"
            }
          >
            🔊 Hands-free
          </button>
        </div>
        <label className="retry-toggle" title="On a wrong answer, hear the explanation then get one more try">
          <input
            type="checkbox"
            checked={retry}
            onChange={(e) => setRetry(e.target.checked)}
          />
          ↻ Retry wrong answers
        </label>
        <label className="answer-time" title="Time limit per answer before it auto-submits">
          ⏱
          <select
            value={answerSecs}
            onChange={(e) => {
              const next = Number(e.target.value);
              setAnswerSecs(next);
              setRemaining(next);
            }}
          >
            {ANSWER_TIME_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s < 60 ? `${s}s` : `${s / 60} min`}
              </option>
            ))}
          </select>
        </label>
      </div>

      {insecureVoice && (
        <p className="insecure-note">
          🎤 The microphone is blocked on this address. Speech needs a secure
          connection — open <code>http://localhost:5173</code> on this machine, or
          serve over HTTPS (<code>npm run dev:https</code>). You can type answers below.
        </p>
      )}

      <div className="question-bar">
        <div className="question-meta">
          {q.senior && (
            <span className="senior-badge" title="Part of the 65/20 study set">
              ★ 65/20
            </span>
          )}
          {attempt > 1 && <span className="attempt-badge">2nd try</span>}
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

      {speech.supported && (stage === "ready" || stage === "result") && (
        <button className="repeat-btn" onClick={() => speech.play(q.id, q.question)}>
          {speech.speaking ? "🔊 Playing…" : "↻ Repeat the question"}
        </button>
      )}

      <div className="answer-area">
        {rec.error && (
          <p className="net-error">
            ⚠️ Speech recognition error: <strong>{rec.error}</strong>.
            {rec.error === "network"
              ? " Chrome's speech service needs an internet connection."
              : rec.error === "not-allowed" || rec.error === "service-not-allowed"
                ? " Allow microphone access for this site."
                : rec.error === "audio-capture"
                  ? " No microphone was found."
                  : ""}{" "}
            You can type your answer instead.
          </p>
        )}
        {stage === "ready" && (
          <div className="interview-prompt">
            {auto && !autoStarted ? (
              <p>Hands-free: I’ll read each question, listen, grade, and move on.</p>
            ) : auto && paused ? (
              <p>Paused.</p>
            ) : attempt > 1 ? (
              <p>One more try — answer the officer out loud.</p>
            ) : (
              <p>When you’re ready, answer the officer out loud.</p>
            )}
            {!auto && !(auto && (paused || !autoStarted)) && (
              <p className="time-hint">You’ll have {fmtTime(answerSecs)} to answer.</p>
            )}
            <p className="privacy-note">
              🔒 Your answer is transcribed and graded to give feedback — audio
              isn’t stored.
            </p>
            {netError && <p className="net-error">{netError}</p>}
          </div>
        )}

        {stage === "listening" && (
          <div className="live-transcript" aria-live="polite">
            <span className="rec-dot" />{" "}
            {auto ? "Listening…" : `Listening — ${fmtTime(remaining)} left`}
            <p>{rec.transcript || "Speak your answer."}</p>
          </div>
        )}

        {stage === "rec-audio" && (
          <div className="live-transcript" aria-live="polite">
            <span className="rec-dot" /> Recording — {fmtTime(remaining)} left. Speak your answer.
          </div>
        )}

        {stage === "transcribing" && (
          <div className="interview-prompt grading">
            <span className="rec-dot" /> Transcribing your answer…
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
              <span className="verdict-icon">{OUTCOME_ICON[resultOutcome]}</span>
              <span className="verdict-label">{result.verdict}</span>
            </div>
            <p className="officer-feedback">{result.feedback}</p>
            <p className="heard-line">You said: “{result.heard || "—"}”</p>
            {!resultCorrect && (
              <p className="answer-line">Accepted answer: {result.correctAnswer}</p>
            )}
            {resultCorrect && attempt > 1 && (
              <p className="answer-line">Got it on the retry — flagged for review.</p>
            )}
            {auto && !paused && (
              <p className="auto-next-hint">
                {retryAvailable ? "Let’s try that one again…" : "Next question coming up…"}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="footer-bar interview-footer">
        {/* Hands-free controls */}
        {auto && stage === "ready" && !autoStarted && (
          <button className="mic-btn" onClick={startHandsFree}>
            ▶ Start hands-free
          </button>
        )}
        {auto && stage === "ready" && autoStarted && paused && (
          <button className="mic-btn" onClick={resumeAuto}>
            ▶ Resume
          </button>
        )}
        {auto && (stage === "listening" || stage === "grading") && (
          <button className="btn btn-ghost" onClick={pauseAuto}>
            ⏸ Pause
          </button>
        )}

        {/* Manual answer controls */}
        {!auto && stage === "ready" && (
          <>
            {rec.supported ? (
              <button className="mic-btn" onClick={manualStart}>
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
        {!auto && stage === "listening" && (
          <button className="mic-btn is-recording" onClick={manualStopSubmit}>
            Submit · {fmtTime(remaining)}
          </button>
        )}
        {!auto && stage === "rec-audio" && (
          <button className="mic-btn is-recording" onClick={stopAudioRecording}>
            Submit · {fmtTime(remaining)}
          </button>
        )}

        {/* Result actions */}
        {stage === "result" && (
          <>
            {!auto && retryAvailable && (
              <>
                <button className="btn btn-primary btn-wide" onClick={startRetry}>
                  🎤 Try again
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => result && commitOutcome(result, "missed")}
                >
                  Skip — mark for practice
                </button>
              </>
            )}
            {!auto && !retryAvailable && (
              <>
                <button
                  className={`btn btn-wide ${resultCorrect ? "btn-correct" : "btn-primary"}`}
                  onClick={() => result && commitOutcome(result, resultOutcome)}
                >
                  {index + 1 >= deck.length ? "Finish interview" : "Next question"}
                </button>
                <button className="btn btn-ghost" onClick={redo}>
                  Try again
                </button>
              </>
            )}
            {auto && (
              <button className="btn btn-ghost" onClick={pauseAuto}>
                ⏸ Pause
              </button>
            )}
          </>
        )}
      </div>

      {/* Typed fallback */}
      {stage === "edit" && (
        <div className="answer-edit">
          <label htmlFor="answer">Type your answer:</label>
          <textarea
            id="answer"
            className="answer-input"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={3}
          />
          {netError && <p className="net-error">{netError}</p>}
          <button
            className="btn btn-primary btn-wide"
            onClick={() => submitText(answer)}
            disabled={!answer.trim()}
          >
            Submit answer
          </button>
        </div>
      )}

      <div className="interview-status">
        <span className="progress-label">
          Question {index + 1} of {deck.length}
        </span>
        <span className="interview-score">✓ {correctSoFar} correct</span>
      </div>
    </div>
  );
}
