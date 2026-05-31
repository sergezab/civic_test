import { useCallback, useEffect, useRef, useState } from "react";
import type { Question } from "../data/questions";
import type { UseSpeech } from "../hooks/useSpeech";
import type { Mode } from "./StartScreen";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { useRecorder } from "../hooks/useRecorder";
import { useFeedbackAudio } from "../hooks/useFeedbackAudio";
import {
  ANSWER_TIME_OPTIONS,
  REVIEW_DELAY_OPTIONS,
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
import { setUrlParams } from "../utils/url";

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
type AttemptLogFilter = "all" | "wrong" | "corrected" | "practice";

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

interface AttemptLogEntry {
  id: number;
  questionNumber: number;
  deckSize: number;
  question: string;
  acceptableAnswers: string[];
  userAnswer: string;
  heard: string;
  verdict: Verdict;
  correctAnswer: string;
  officerFeedback: string;
  model: string | null;
  fallback: boolean;
  attempt: number;
  answerMode: InterviewMode;
  elapsedMs: number;
  recordedAt: string;
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
const VERDICT_ICON: Record<Verdict, string> = {
  correct: "✓",
  partial: "↻",
  incorrect: "✕",
};
const ATTEMPT_LOG_FILTER_LABELS: Record<AttemptLogFilter, string> = {
  all: "All attempts",
  wrong: "Wrong/partial",
  corrected: "Corrected on retry",
  practice: "Practice set",
};

const fmtTime = (s: number) =>
  `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;

function heardSummary(heard: string): string {
  const trimmed = heard.trim();
  return trimmed ? `I heard: ${trimmed}.` : "I did not catch an answer.";
}

function spokenFeedbackText(result: GradeResult): string {
  return `${heardSummary(result.heard)} ${result.feedback}`;
}

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
    reviewDelaySecs,
    retry,
    setAnswerSecs,
    setInterviewMode,
    setReviewDelaySecs,
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
  const [attemptLog, setAttemptLog] = useState<AttemptLogEntry[]>([]);
  const [logFilter, setLogFilter] = useState<AttemptLogFilter>("all");
  const [done, setDone] = useState(false);
  const [autoStarted, setAutoStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reviewRemaining, setReviewRemaining] = useState<number | null>(null);

  // Refs so delayed callbacks (audio onended, silence timers) read fresh values.
  const lastReadRef = useRef<number | null>(null);
  const resultPanelRef = useRef<HTMLDivElement | null>(null);
  const reviewTimerRef = useRef<number | null>(null);
  const reviewDelayRef = useRef(reviewDelaySecs);
  const autoRef = useRef(auto);
  const pausedRef = useRef(paused);
  const retryRef = useRef(retry);
  const attemptRef = useRef(attempt);
  const logRef = useRef(log);
  const attemptLogRef = useRef(attemptLog);
  const indexRef = useRef(index);
  const deckRef = useRef(deck);
  useEffect(() => void (reviewDelayRef.current = reviewDelaySecs), [reviewDelaySecs]);
  useEffect(() => void (autoRef.current = auto), [auto]);
  useEffect(() => void (pausedRef.current = paused), [paused]);
  useEffect(() => void (retryRef.current = retry), [retry]);
  useEffect(() => void (attemptRef.current = attempt), [attempt]);
  useEffect(() => void (logRef.current = log), [log]);
  useEffect(() => void (attemptLogRef.current = attemptLog), [attemptLog]);
  useEffect(() => void (indexRef.current = index), [index]);
  useEffect(() => void (deckRef.current = deck), [deck]);
  const transcriptRef = useRef("");
  useEffect(() => void (transcriptRef.current = rec.transcript), [rec.transcript]);

  const q = deck[index];

  useEffect(() => {
    if (done) {
      setUrlParams({ q: null, stage: "complete" });
      return;
    }
    if (q) setUrlParams({ q: String(q.id), stage: null });
  }, [done, q]);

  const clearReviewCountdown = useCallback(() => {
    if (reviewTimerRef.current !== null) {
      window.clearInterval(reviewTimerRef.current);
      reviewTimerRef.current = null;
    }
    setReviewRemaining(null);
  }, []);

  const startReviewCountdown = useCallback(
    (onDone: () => void) => {
      clearReviewCountdown();
      const delay = reviewDelayRef.current;
      const deadline = Date.now() + delay * 1000;
      setReviewRemaining(delay);
      reviewTimerRef.current = window.setInterval(() => {
        const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        setReviewRemaining(left);
        if (left <= 0) {
          clearReviewCountdown();
          onDone();
        }
      }, 250);
    },
    [clearReviewCountdown],
  );

  const resetTo = (qs: Question[]) => {
    clearReviewCountdown();
    setDeck(qs);
    setIndex(0);
    setLog([]);
    setAttemptLog([]);
    setLogFilter("all");
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
      clearReviewCountdown();
      speech.stop();
      if (rec.listening) rec.stop();
      if (autoRef.current) {
        pausedRef.current = false;
        setPaused(false);
      }
      const cq = deckRef.current[indexRef.current];
      if (!cq) return;
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
    [clearReviewCountdown, mode, rec, speech, stopFeedbackAudio],
  );

  const startRetry = useCallback(() => {
    stopFeedbackAudio();
    clearReviewCountdown();
    setResult(null);
    setNetError(null);
    pausedRef.current = false;
    setPaused(false);
    attemptRef.current = 2;
    setAttempt(2);
    rec.reset();
    const retryQuestion = deckRef.current[indexRef.current];
    ilog("iv", "retry", { q: retryQuestion?.id });
    setStage("ready");
    if (!retryQuestion) return;
    if (autoRef.current) {
      speech.play(retryQuestion.id, retryQuestion.question, beginListening);
      return;
    }
    speech.play(retryQuestion.id, retryQuestion.question);
  }, [beginListening, clearReviewCountdown, rec, speech, stopFeedbackAudio]);

  const submitText = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      const t0 = now();
      speech.stop();
      if (rec.listening) rec.stop();
      setStage("grading");
      setNetError(null);
      const cq = deckRef.current[indexRef.current];
      if (!cq) {
        setStage("ready");
        return;
      }
      ilog("iv", "submit", {
        q: cq.id,
        attempt: attemptRef.current,
        chars: text.length,
        mode: autoRef.current ? "auto" : "manual",
      });
      try {
        const res = await gradeAnswer(cq.question, cq.acceptableAnswers, text, cq.id);
        const elapsedMs = since(t0);
        const auditEntry: AttemptLogEntry = {
          id: cq.id,
          questionNumber: indexRef.current + 1,
          deckSize: deckRef.current.length,
          question: cq.question,
          acceptableAnswers: cq.acceptableAnswers,
          userAnswer: text,
          heard: res.heard,
          verdict: res.verdict,
          correctAnswer: res.correctAnswer,
          officerFeedback: res.feedback,
          model: res.model,
          fallback: res.fallback,
          attempt: attemptRef.current,
          answerMode: autoRef.current ? "auto" : "manual",
          elapsedMs,
          recordedAt: new Date().toISOString(),
        };
        setAttemptLog((prev) => {
          const next = [...prev, auditEntry];
          attemptLogRef.current = next;
          return next;
        });
        ilog("iv", "grade audit", {
          q: cq.id,
          ms: elapsedMs,
          attempt: auditEntry.attempt,
          verdict: res.verdict,
          userAnswer: text,
          heard: res.heard,
          officerFeedback: res.feedback,
          correctAnswer: res.correctAnswer,
          model: res.model,
          fallback: res.fallback,
        });
        setResult(res);
        setStage("result");
        const tf = now();
        playFeedback(spokenFeedbackText(res), () => {
          ilog("iv", "feedback done", { q: cq.id, ms: since(tf) });
          if (!autoRef.current || pausedRef.current) return; // manual: buttons drive it
          const { canRetry, outcome } = decide(res);
          startReviewCountdown(() => {
            if (canRetry) startRetry();
            else commitOutcome(res, outcome);
          });
        });
      } catch {
        ilog("iv", "grade error", { q: cq.id, ms: since(t0) });
        setNetError("Couldn't reach the grader — try again.");
        setStage("ready");
        if (autoRef.current) setPaused(true);
      }
    },
    [commitOutcome, decide, playFeedback, rec, speech, startRetry, startReviewCountdown],
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

  useEffect(() => {
    if (stage === "result") resultPanelRef.current?.focus();
  }, [stage, result?.verdict]);

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
    clearReviewCountdown();
    setResult(null);
    setNetError(null);
    rec.reset();
    pausedRef.current = false;
    setPaused(false);
    if (auto) beginListening();
    else setStage("ready");
  };

  const goPrevious = () => {
    if (indexRef.current <= 0) return;
    clearReviewCountdown();
    stopFeedbackAudio();
    speech.stop();
    if (rec.listening) rec.stop();
    const nextIndex = indexRef.current - 1;
    indexRef.current = nextIndex;
    attemptRef.current = 1;
    setAttempt(1);
    setResult(null);
    setAnswer("");
    setNetError(null);
    setDone(false);
    setStage("ready");
    setIndex(nextIndex);
    setLog((prev) => {
      const next = prev.slice(0, nextIndex);
      logRef.current = next;
      return next;
    });
    if (autoRef.current) {
      pausedRef.current = true;
      setPaused(true);
    }
    lastReadRef.current = null;
    rec.reset();
    ilog("iv", "previous", { to: nextIndex + 1 });
  };

  const startHandsFree = () => {
    clearReviewCountdown();
    setNetError(null);
    pausedRef.current = false;
    setPaused(false);
    lastReadRef.current = null; // force re-read + listen for current question
    setAutoStarted(true);
  };
  const pauseAuto = () => {
    clearReviewCountdown();
    pausedRef.current = true;
    setPaused(true);
    if (rec.listening) rec.stop();
    stopFeedbackAudio();
    speech.stop();
    setStage("ready");
  };
  const resumeAuto = () => {
    clearReviewCountdown();
    pausedRef.current = false;
    setPaused(false);
    lastReadRef.current = null;
  };

  const switchMode = (next: InterviewMode) => {
    if (next === interviewMode) return;
    clearReviewCountdown();
    if (rec.listening) rec.stop();
    stopFeedbackAudio();
    speech.stop();
    setInterviewMode(next);
    setStage("ready");
    setResult(null);
    if (next === "auto" && autoAvailable) {
      lastReadRef.current = null;
      pausedRef.current = false;
      setPaused(false);
      setAutoStarted(true);
    } else {
      setAutoStarted(false);
    }
  };

  const pauseReviewCountdown = () => {
    clearReviewCountdown();
    pausedRef.current = true;
    setPaused(true);
  };

  const downloadAttemptLog = () => {
    const exportedAt = new Date().toISOString();
    const payload = {
      app: "civic-test-interview",
      exportedAt,
      session: {
        mode,
        deckSize: deckRef.current.length,
        completedQuestions: logRef.current.length,
      },
      attempts: attemptLogRef.current,
      finalOutcomes: logRef.current,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `civics-interview-log-${exportedAt.replace(/[:.]/g, "-")}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  useEffect(() => clearReviewCountdown, [clearReviewCountdown]);

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
    const correctedIds = new Set(log.filter((e) => e.outcome === "review").map((e) => e.id));
    const practiceIds = new Set(toPractice.map((question) => question.id));
    const filteredAttemptLog = attemptLog.filter((entry) => {
      if (logFilter === "wrong") return entry.verdict !== "correct";
      if (logFilter === "corrected") return correctedIds.has(entry.id);
      if (logFilter === "practice") return practiceIds.has(entry.id);
      return true;
    });
    const filterCounts: Record<AttemptLogFilter, number> = {
      all: attemptLog.length,
      wrong: attemptLog.filter((entry) => entry.verdict !== "correct").length,
      corrected: correctedIds.size,
      practice: practiceIds.size,
    };
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

        <div className="start-actions result-actions">
          {toPractice.length > 0 && (
            <button className="btn btn-primary" onClick={() => resetTo(toPractice)}>
              Practice {toPractice.length} for review
            </button>
          )}
          <button
            className={`btn ${toPractice.length > 0 ? "btn-ghost" : "btn-primary"}`}
            onClick={onRestart}
          >
            New interview
          </button>
          {attemptLog.length > 0 && (
            <button className="btn btn-ghost" onClick={downloadAttemptLog}>
              Download interview log
            </button>
          )}
          <button className="btn btn-ghost" onClick={onHome}>
            Back to start
          </button>
        </div>

        <h2 className="review-title">Interview log</h2>
        <div className="log-filter" role="group" aria-label="Filter interview log">
          {(["all", "wrong", "corrected", "practice"] as const).map((filter) => (
            <button
              key={filter}
              className={logFilter === filter ? "is-active" : ""}
              onClick={() => setLogFilter(filter)}
              aria-pressed={logFilter === filter}
            >
              {ATTEMPT_LOG_FILTER_LABELS[filter]}{" "}
              <span>{filterCounts[filter]}</span>
            </button>
          ))}
        </div>
        <div className="transcript-review" aria-label="Interview attempt log">
          {filteredAttemptLog.map((e, i) => (
            <div
              key={`${e.id}-${e.questionNumber}-${e.attempt}-${i}`}
              className={`tr-row tr-${e.verdict}`}
            >
              <span className="tr-icon">{VERDICT_ICON[e.verdict]}</span>
              <div className="tr-body">
                <p className="tr-q">
                  Q{e.questionNumber}. {e.question}
                </p>
                <p className="tr-meta">
                  Attempt {e.attempt} · {e.answerMode} · {e.verdict}
                  {e.fallback ? " · deterministic fallback" : e.model ? ` · ${e.model}` : ""}
                </p>
                <p className="tr-heard">
                  Applicant answer: “{e.heard || e.userAnswer || "—"}”
                </p>
                <p className="tr-officer">Officer response: {e.officerFeedback}</p>
                <p className="tr-answer">Official accepted: {e.acceptableAnswers.join("; ")}</p>
              </div>
            </div>
          ))}
          {filteredAttemptLog.length === 0 && (
            <p className="empty-log-filter">No attempts match this filter.</p>
          )}
        </div>
      </div>
    );
  }

  // ── Active question ───────────────────────────────────────────
  if (!q) return null;

  const correctSoFar = log.filter((e) => e.outcome === "correct").length;
  const reviewSoFar = log.filter((e) => e.outcome === "review").length;
  const missedSoFar = log.filter((e) => e.outcome === "missed").length;
  const answeredCount = log.length;
  const progressPercent = deck.length > 0 ? (answeredCount / deck.length) * 100 : 0;
  const currentResultLabel = result ? `${result.verdict} on this question` : null;
  const canGoPrevious =
    index > 0 && !["listening", "rec-audio", "transcribing", "grading"].includes(stage);
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
            aria-pressed={interviewMode === "manual"}
          >
            ✋ Manual
          </button>
          <button
            className={interviewMode === "auto" ? "is-active" : ""}
            onClick={() => switchMode("auto")}
            disabled={!autoAvailable}
            aria-pressed={interviewMode === "auto"}
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
        <label className="answer-time" title="Time to read feedback before hands-free continues">
          Review
          <select
            value={reviewDelaySecs}
            onChange={(e) => setReviewDelaySecs(Number(e.target.value))}
          >
            {REVIEW_DELAY_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}s
              </option>
            ))}
          </select>
        </label>
      </div>

      {insecureVoice && (() => {
        const { protocol, host, hostname, pathname, search, hash } = window.location
        const httpsUrl = `https://${host}${pathname}${search}${hash}`
        const isLocalHostname = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
        return (
          <p className="insecure-note">
            🎤 The microphone is blocked on this address ({protocol}//{host}). Browsers only allow
            mic access over HTTPS or on <code>localhost</code>.{" "}
            {isLocalHostname ? (
              <>You're already on localhost — try reloading. If that doesn't help, serve over HTTPS with{" "}
              <code>bash bin/civicctl.sh restart --https</code>.</>
            ) : (
              <>Open <a href={httpsUrl}>{httpsUrl}</a> instead (you'll need to accept the self-signed
              cert once). To enable HTTPS on the server, run{" "}
              <code>bash bin/civicctl.sh restart --https</code>.</>
            )}
            {" "}You can type answers below in the meantime.
          </p>
        )
      })()}

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
            aria-label={bookmarked ? "Remove from saved" : "Save for later"}
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
          <p className="net-error" role="alert">
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
              <p>One more try — listen to the question again, then answer the officer.</p>
            ) : (
              <p>When you’re ready, answer the officer out loud.</p>
            )}
            {!auto && !(auto && (paused || !autoStarted)) && (
              <p className="time-hint">You’ll have {fmtTime(answerSecs)} to answer.</p>
            )}
            <p className="privacy-note">
              🔒 Your answer is transcribed and graded to give feedback. Audio isn’t stored; the
              text log stays on this page until you leave or download it.
            </p>
            {netError && (
              <p className="net-error" role="alert">
                {netError}
              </p>
            )}
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
          <div
            ref={resultPanelRef}
            className={`officer-result verdict-${result.verdict}`}
            tabIndex={-1}
            role="status"
            aria-live="polite"
          >
            <div className="verdict-badge">
              <span className="verdict-icon">{OUTCOME_ICON[resultOutcome]}</span>
              <span className="verdict-label">{result.verdict}</span>
            </div>
            <p className="officer-feedback">{result.feedback}</p>
            <div className="heard-line">
              <span className="heard-label">What I heard:</span>
              <span>“{result.heard || "—"}”</span>
            </div>
            <div className="accepted-answer-panel">
              <p className="accepted-answer-title">
                Official accepted answer{q.acceptableAnswers.length === 1 ? "" : "s"}:
              </p>
              <ul>
                {q.acceptableAnswers.map((accepted) => (
                  <li key={accepted}>{accepted}</li>
                ))}
              </ul>
            </div>
            {resultCorrect && attempt > 1 && (
              <p className="answer-line">Got it on the retry — flagged for review.</p>
            )}
            {auto && reviewRemaining !== null && (
              <p className="auto-next-hint">
                {retryAvailable
                  ? `Trying again in ${reviewRemaining}s…`
                  : resultCorrect
                    ? `Next question in ${reviewRemaining}s…`
                    : `Continuing in ${reviewRemaining}s…`}
              </p>
            )}
            {auto && paused && (
              <p className="auto-next-hint">
                Countdown paused. Use the controls below when you're ready.
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
            {retryAvailable && (
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
            {(!retryAvailable && (!auto || paused || !resultCorrect || reviewRemaining !== null)) && (
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
            {auto && reviewRemaining !== null && (
              <button className="btn btn-ghost" onClick={pauseReviewCountdown}>
                ⏸ Pause countdown
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
          {netError && (
            <p className="net-error" role="alert">
              {netError}
            </p>
          )}
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
        <div className="interview-status-main">
          <div className="interview-status-row">
            <span className="progress-label">
              Question {index + 1} of {deck.length}
            </span>
            <span className="progress-label">
              Answered {answeredCount} of {deck.length}
            </span>
          </div>
          <div
            className="interview-progress"
            role="progressbar"
            aria-label="Interview progress"
            aria-valuemin={0}
            aria-valuemax={deck.length}
            aria-valuenow={answeredCount}
          >
            <div className="interview-progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="interview-score-row" aria-live="polite">
            <span className="interview-score score-correct">✓ {correctSoFar} correct</span>
            <span className="interview-score score-review">↻ {reviewSoFar} review</span>
            <span className="interview-score score-missed">✕ {missedSoFar} missed</span>
            {currentResultLabel && (
              <span className={`interview-score score-now verdict-${result?.verdict}`}>
                Now: {currentResultLabel}
              </span>
            )}
          </div>
        </div>
        <button className="btn btn-ghost interview-prev-btn" onClick={goPrevious} disabled={!canGoPrevious}>
          ← Previous question
        </button>
      </div>
    </div>
  );
}
