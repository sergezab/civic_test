import { useCallback, useEffect, useState } from "react";
import { questions } from "./data/questions";
import type { Question } from "./data/questions";
import { useSpeech } from "./hooks/useSpeech";
import { useBookmarks } from "./hooks/useBookmarks";
import { sample, shuffle } from "./utils/quiz";
import { readUrlParams, setUrlParams, clearUrlParams } from "./utils/url";
import { Header } from "./components/Header";
import { StartScreen } from "./components/StartScreen";
import type { QuizConfig } from "./components/StartScreen";
import { QuizScreen } from "./components/QuizScreen";
import { FlashScreen } from "./components/FlashScreen";
import { InterviewScreen } from "./components/InterviewScreen";
import { ResultsScreen } from "./components/ResultsScreen";

type Phase = "start" | "quiz" | "results";

const TEST_LENGTH = 10;

export default function App() {
  const speech = useSpeech();
  const { bookmarks, toggle: toggleBookmark, isBookmarked, count: bookmarkCount } =
    useBookmarks();
  const [phase, setPhase] = useState<Phase>("start");
  const [config, setConfig] = useState<QuizConfig | null>(null);
  const [session, setSession] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<(boolean | null)[]>([]);

  const startQuiz = useCallback(
    (cfg: QuizConfig, startId?: number) => {
      const pool =
        cfg.pool === "senior"
          ? questions.filter((q) => q.senior)
          : cfg.pool === "bookmarks"
            ? questions.filter((q) => bookmarks.has(q.id))
            : questions;

      let list = cfg.mode === "test" ? sample(pool, TEST_LENGTH) : shuffle(pool);

      if (startId !== undefined) {
        const pos = list.findIndex((q) => q.id === startId);
        if (pos > 0) {
          const [q] = list.splice(pos, 1);
          list = [q, ...list];
        }
      }

      setConfig(cfg);
      setSession(list);
      setIndex(0);
      setResults(Array(list.length).fill(null));
      setPhase("quiz");

      setUrlParams({
        format: cfg.format,
        mode: cfg.mode,
        pool: cfg.pool,
        q: list[0]?.id?.toString() ?? null,
        stage: null,
      });
    },
    [bookmarks],
  );

  // Auto-start from URL on first load (bookmarks are read synchronously from
  // localStorage so they're correct on the first render that startQuiz closes over).
  useEffect(() => {
    const { format, mode, pool, q } = readUrlParams();
    if (format && mode && pool) {
      const cfg = { format, mode, pool } as QuizConfig;
      startQuiz(cfg, q ?? undefined);
    }
    // intentionally run once on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the q param in sync as the user moves through quiz questions.
  useEffect(() => {
    if (phase === "quiz" && session[index]) {
      setUrlParams({ q: String(session[index].id) });
    }
  }, [phase, session, index]);

  const handleNext = useCallback(
    (correct: boolean) => {
      speech.stop();
      setResults((prev) => {
        const next = [...prev];
        next[index] = correct;
        return next;
      });
      const nextIndex = index + 1;
      if (nextIndex >= session.length) {
        setPhase("results");
        clearUrlParams();
      } else {
        setIndex(nextIndex);
      }
    },
    [index, session.length, speech],
  );

  const goHome = useCallback(() => {
    speech.stop();
    clearUrlParams();
    setPhase("start");
  }, [speech]);

  const retry = useCallback(() => {
    if (config) startQuiz(config);
  }, [config, startQuiz]);

  const score = results.filter((r) => r === true).length;
  const current = session[index];

  return (
    <div className="app">
      <Header
        muted={speech.muted}
        onToggleMute={speech.toggleMute}
        speechSupported={speech.supported}
        onHome={goHome}
      />

      <main className="content">
        {phase === "start" && (
          <StartScreen
            onStart={startQuiz}
            speechSupported={speech.supported}
            bookmarkCount={bookmarkCount}
          />
        )}

        {phase === "quiz" &&
          session.length > 0 &&
          (config?.format === "flash" ? (
            <FlashScreen
              cards={session}
              speech={speech}
              isBookmarked={isBookmarked}
              onToggleBookmark={toggleBookmark}
              onRestart={retry}
              onHome={goHome}
            />
          ) : config?.format === "interview" ? (
            <InterviewScreen
              questions={session}
              mode={config.mode}
              speech={speech}
              isBookmarked={isBookmarked}
              onToggleBookmark={toggleBookmark}
              onRestart={retry}
              onHome={goHome}
            />
          ) : current ? (
            <QuizScreen
              key={current.id}
              question={current}
              index={index}
              total={session.length}
              results={results}
              speech={speech}
              isBookmarked={isBookmarked}
              onToggleBookmark={toggleBookmark}
              onNext={handleNext}
            />
          ) : null)}

        {phase === "results" && config && (
          <ResultsScreen
            score={score}
            total={session.length}
            mode={config.mode}
            bookmarkCount={bookmarkCount}
            onRetry={retry}
            onHome={goHome}
            onStudyBookmarks={() =>
              startQuiz({
                format: config.format,
                mode: "practice",
                pool: "bookmarks",
              })
            }
          />
        )}
      </main>

      <footer className="site-footer">
        Practice tool · based on the USCIS 2008 civics test. Answers about
        current officials change — verify at uscis.gov/citizenship/testupdates.
      </footer>
    </div>
  );
}
