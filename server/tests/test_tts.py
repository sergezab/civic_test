"""TTS: empty-input guard, WAV file reader, and engine selection/fallback.

Real Piper/`say` invocations are monkeypatched out — no subprocesses spawned.
"""

import config
import tts


def test_synthesize_empty_returns_none():
    assert tts.synthesize("") is None
    assert tts.synthesize("   ") is None


def test_read_and_unlink_missing_file(tmp_path):
    assert tts._read_and_unlink(str(tmp_path / "nope.wav")) is None


def test_read_and_unlink_rejects_tiny_file(tmp_path):
    p = tmp_path / "tiny.wav"
    p.write_bytes(b"x" * 10)  # smaller than a 44-byte WAV header
    assert tts._read_and_unlink(str(p)) is None
    assert not p.exists()  # still cleaned up


def test_read_and_unlink_returns_bytes_and_cleans_up(tmp_path):
    p = tmp_path / "ok.wav"
    payload = b"R" * 100
    p.write_bytes(payload)
    assert tts._read_and_unlink(str(p)) == payload
    assert not p.exists()


def test_synthesize_uses_piper_when_available(monkeypatch):
    monkeypatch.setattr(config, "TTS_ENGINE", "piper")
    monkeypatch.setattr(tts, "_piper_wav", lambda text: b"PIPERWAV")
    assert tts.synthesize("hello officer") == b"PIPERWAV"


def test_synthesize_falls_back_to_say(monkeypatch):
    monkeypatch.setattr(config, "TTS_ENGINE", "piper")
    monkeypatch.setattr(tts, "_piper_wav", lambda text: None)
    monkeypatch.setattr(tts, "_say_wav", lambda text: b"SAYWAV")
    assert tts.synthesize("hello officer") == b"SAYWAV"


def test_synthesize_returns_none_when_all_engines_fail(monkeypatch):
    monkeypatch.setattr(config, "TTS_ENGINE", "piper")
    monkeypatch.setattr(tts, "_piper_wav", lambda text: None)
    monkeypatch.setattr(tts, "_say_wav", lambda text: None)
    assert tts.synthesize("hello officer") is None
