"""STT: segment joining + tempfile cleanup, with the Whisper model faked out
so no model download/load happens."""

import os

import stt


class _FakeSegment:
    def __init__(self, text):
        self.text = text


class _FakeModel:
    def __init__(self, segments):
        self._segments = segments
        self.seen_path = None

    def transcribe(self, path, language=None, vad_filter=None):
        self.seen_path = path
        assert os.path.exists(path)  # file must still exist during transcription
        return (self._segments, {"language": language})


def test_transcribe_joins_and_trims_segments(monkeypatch):
    model = _FakeModel([_FakeSegment("  Hello "), _FakeSegment(" world  ")])
    monkeypatch.setattr(stt, "_get_model", lambda: model)
    assert stt.transcribe(b"fake-audio", suffix=".webm") == "Hello world"


def test_transcribe_cleans_up_tempfile(monkeypatch):
    model = _FakeModel([_FakeSegment("ok")])
    monkeypatch.setattr(stt, "_get_model", lambda: model)
    stt.transcribe(b"data", suffix=".mp4")
    assert model.seen_path is not None
    assert not os.path.exists(model.seen_path)  # removed in the finally block


def test_transcribe_handles_empty_result(monkeypatch):
    monkeypatch.setattr(stt, "_get_model", lambda: _FakeModel([]))
    assert stt.transcribe(b"data") == ""
