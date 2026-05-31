"""Grader: JSON extraction, deterministic fallback, and the LLM happy/error paths.

All network calls are monkeypatched out, so these run in milliseconds.
"""

import config
import grader
import pytest


# ── _extract_json ─────────────────────────────────────────────────────────────
def test_extract_json_strips_think_and_code_fences():
    raw = (
        "<think>let me reason about this</think>\n"
        '```json\n{"verdict":"correct","feedback":"hi","correctAnswer":"x"}\n```'
    )
    data = grader._extract_json(raw)
    assert data["verdict"] == "correct"
    assert data["correctAnswer"] == "x"


def test_extract_json_finds_object_amid_prose():
    raw = 'Sure! {"verdict":"partial","feedback":"close","correctAnswer":"y"} hope that helps'
    assert grader._extract_json(raw)["verdict"] == "partial"


def test_extract_json_raises_when_no_object():
    with pytest.raises(ValueError):
        grader._extract_json("there is no json here")


# ── _tokens / _fallback ───────────────────────────────────────────────────────
def test_tokens_lowercases_and_splits():
    assert grader._tokens("John Roberts!") == {"john", "roberts"}


def test_fallback_substring_match_is_correct():
    r = grader._fallback("Q", ["the Constitution"], "the constitution")
    assert r["verdict"] == "correct"
    assert r["fallback"] is True


def test_fallback_partial_name_is_correct():
    # "Roberts" should satisfy the accepted "John Roberts" (token overlap / substring).
    r = grader._fallback("Q", ["John Roberts"], "Roberts")
    assert r["verdict"] == "correct"


def test_fallback_wrong_answer_is_incorrect():
    r = grader._fallback("Q", ["George Washington"], "banana")
    assert r["verdict"] == "incorrect"
    assert r["correctAnswer"] == "George Washington"


# ── grade() ───────────────────────────────────────────────────────────────────
def test_grade_empty_transcript_short_circuits():
    r = grader.grade("Q", ["x"], "   ")
    assert r["verdict"] == "incorrect"
    assert r["heard"] == ""
    assert r["model"] is None
    assert r["fallback"] is True


def test_grade_parses_llm_json(monkeypatch):
    monkeypatch.setattr(config, "GRADER_PROVIDER", "ollama")
    monkeypatch.setattr(
        grader,
        "_ollama_chat",
        lambda messages, session=None: '{"verdict":"partial","feedback":"close","correctAnswer":"the answer"}',
    )
    r = grader.grade("Q", ["the answer"], "an answer")
    assert r["verdict"] == "partial"
    assert r["fallback"] is False
    assert r["heard"] == "an answer"
    assert r["model"] == config.GRADER_MODEL


def test_grade_rejects_bad_verdict_then_falls_back(monkeypatch):
    monkeypatch.setattr(config, "GRADER_PROVIDER", "ollama")
    monkeypatch.setattr(
        grader,
        "_ollama_chat",
        lambda messages, session=None: '{"verdict":"maybe","feedback":"?","correctAnswer":"z"}',
    )
    r = grader.grade("Q", ["the Constitution"], "the constitution")
    # bad verdict → exception → deterministic fallback (substring match wins)
    assert r["fallback"] is True
    assert r["verdict"] == "correct"


def test_grade_falls_back_when_llm_raises(monkeypatch):
    monkeypatch.setattr(config, "GRADER_PROVIDER", "ollama")

    def boom(messages, session=None):
        raise RuntimeError("ollama unreachable")

    monkeypatch.setattr(grader, "_ollama_chat", boom)
    r = grader.grade("Q", ["George Washington"], "nonsense")
    assert r["fallback"] is True
    assert r["model"] is None
    assert r["verdict"] == "incorrect"
