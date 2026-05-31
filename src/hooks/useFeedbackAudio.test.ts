import { act, renderHook } from "@testing-library/react";
import { createElement, StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { synthesizeSpeech } from "../api/interview";
import { useFeedbackAudio } from "./useFeedbackAudio";

vi.mock("../api/interview", () => ({
  synthesizeSpeech: vi.fn(),
}));

const mockedSynthesizeSpeech = vi.mocked(synthesizeSpeech);

class FakeSpeechSynthesisUtterance {
  text: string;
  lang = "";
  rate = 1;
  onstart: ((event: SpeechSynthesisEvent) => void) | null = null;
  onend: ((event: SpeechSynthesisEvent) => void) | null = null;
  onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

function installBrowserSpeech() {
  const spoken: FakeSpeechSynthesisUtterance[] = [];
  const synth = {
    speaking: false,
    pending: false,
    cancel: vi.fn(() => {
      synth.speaking = false;
      synth.pending = false;
    }),
    resume: vi.fn(),
    speak: vi.fn((utterance: FakeSpeechSynthesisUtterance) => {
      spoken.push(utterance);
      synth.speaking = true;
      utterance.onstart?.({} as SpeechSynthesisEvent);
    }),
  };

  Object.defineProperty(window, "speechSynthesis", {
    value: synth,
    configurable: true,
  });
  Object.defineProperty(globalThis, "SpeechSynthesisUtterance", {
    value: FakeSpeechSynthesisUtterance,
    configurable: true,
  });
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    value: FakeSpeechSynthesisUtterance,
    configurable: true,
  });

  return { spoken, synth };
}

function removeBrowserSpeech() {
  Object.defineProperty(window, "speechSynthesis", {
    value: undefined,
    configurable: true,
  });
  Object.defineProperty(globalThis, "SpeechSynthesisUtterance", {
    value: undefined,
    configurable: true,
  });
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    value: undefined,
    configurable: true,
  });
}

function installRejectingAudio() {
  class RejectingAudio {
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    play = vi.fn(() => Promise.reject(new Error("blocked")));
    pause = vi.fn();
  }

  Object.defineProperty(globalThis, "Audio", {
    value: RejectingAudio,
    configurable: true,
  });
  Object.defineProperty(window, "Audio", {
    value: RejectingAudio,
    configurable: true,
  });
}

function installResolvingAudio() {
  const instances: ResolvingAudio[] = [];

  class ResolvingAudio {
    src: string;
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    play = vi.fn(() => Promise.resolve());
    pause = vi.fn();

    constructor(src: string) {
      this.src = src;
      instances.push(this);
    }
  }

  Object.defineProperty(globalThis, "Audio", {
    value: ResolvingAudio,
    configurable: true,
  });
  Object.defineProperty(window, "Audio", {
    value: ResolvingAudio,
    configurable: true,
  });

  return instances;
}

beforeEach(() => {
  vi.useFakeTimers();
  mockedSynthesizeSpeech.mockReset();
  Object.defineProperty(URL, "revokeObjectURL", {
    value: vi.fn(),
    configurable: true,
  });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useFeedbackAudio", () => {
  it("uses browser speech when backend TTS is unavailable", async () => {
    const { spoken, synth } = installBrowserSpeech();
    mockedSynthesizeSpeech.mockResolvedValue(null);
    const stopQuestionAudio = vi.fn();
    const onDone = vi.fn();
    const { result } = renderHook(() => useFeedbackAudio(stopQuestionAudio));

    await act(async () => {
      await result.current.play("I heard: reviews laws. Correct.", onDone);
    });

    expect(stopQuestionAudio).toHaveBeenCalledTimes(1);
    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(spoken).toHaveLength(1);
    const utterance = spoken[0]!;
    expect(utterance.text).toBe("I heard: reviews laws. Correct.");
    expect(onDone).not.toHaveBeenCalled();

    act(() => {
      utterance.onend?.({} as SpeechSynthesisEvent);
    });

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("still plays feedback after React StrictMode remount checks", async () => {
    const audioInstances = installResolvingAudio();
    mockedSynthesizeSpeech.mockResolvedValue("blob:officer-feedback");
    const stopQuestionAudio = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(StrictMode, null, children);
    const { result } = renderHook(() => useFeedbackAudio(stopQuestionAudio), { wrapper });

    await act(async () => {
      await result.current.play("That is exactly right.", vi.fn());
      await Promise.resolve();
    });

    expect(audioInstances).toHaveLength(1);
    expect(audioInstances[0]!.src).toBe("blob:officer-feedback");
    expect(audioInstances[0]!.play).toHaveBeenCalledTimes(1);
  });

  it("falls back to browser speech when generated audio cannot play", async () => {
    const { spoken, synth } = installBrowserSpeech();
    installRejectingAudio();
    mockedSynthesizeSpeech.mockResolvedValue("blob:officer-feedback");
    const stopQuestionAudio = vi.fn();
    const onDone = vi.fn();
    const { result } = renderHook(() => useFeedbackAudio(stopQuestionAudio));

    await act(async () => {
      await result.current.play("That is exactly right.", onDone);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(spoken).toHaveLength(1);
    expect(spoken[0]!.text).toBe("That is exactly right.");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:officer-feedback");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("still completes with a text-only delay when no speech engine exists", async () => {
    removeBrowserSpeech();
    mockedSynthesizeSpeech.mockResolvedValue(null);
    const stopQuestionAudio = vi.fn();
    const onDone = vi.fn();
    const { result } = renderHook(() => useFeedbackAudio(stopQuestionAudio));

    await act(async () => {
      await result.current.play("Correct.", onDone);
    });

    expect(onDone).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(6_000);
    });

    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
