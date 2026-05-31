import { useEffect, useState } from "react";

export type InterviewMode = "manual" | "auto";

export const ANSWER_TIME_OPTIONS = [30, 45, 60, 90, 120] as const;

function readInterviewMode(): InterviewMode {
  try {
    const value = localStorage.getItem("iv-mode");
    if (value === "auto" || value === "manual") return value;
  } catch {
    /* ignore */
  }
  return "manual";
}

function readRetry(): boolean {
  try {
    return localStorage.getItem("iv-retry") === "1";
  } catch {
    return false;
  }
}

function readAnswerSecs(): number {
  try {
    const value = Number(localStorage.getItem("iv-answer-secs"));
    if (ANSWER_TIME_OPTIONS.includes(value as (typeof ANSWER_TIME_OPTIONS)[number])) {
      return value;
    }
  } catch {
    /* ignore */
  }
  return 30;
}

export function useInterviewPreferences() {
  const [interviewMode, setInterviewMode] = useState<InterviewMode>(readInterviewMode);
  const [retry, setRetry] = useState<boolean>(readRetry);
  const [answerSecs, setAnswerSecs] = useState<number>(readAnswerSecs);

  useEffect(() => {
    try {
      localStorage.setItem("iv-mode", interviewMode);
    } catch {
      /* ignore */
    }
  }, [interviewMode]);

  useEffect(() => {
    try {
      localStorage.setItem("iv-retry", retry ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [retry]);

  useEffect(() => {
    try {
      localStorage.setItem("iv-answer-secs", String(answerSecs));
    } catch {
      /* ignore */
    }
  }, [answerSecs]);

  return {
    answerSecs,
    interviewMode,
    retry,
    setAnswerSecs,
    setInterviewMode,
    setRetry,
  };
}
