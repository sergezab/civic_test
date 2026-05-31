"""Config parsing + runtime defaults (pure, no env mutation)."""

import config


def test_origins_splits_and_trims():
    assert config._origins("a, b ,c") == ["a", "b", "c"]


def test_origins_drops_blanks():
    assert config._origins("") == []
    assert config._origins("  ,  , ") == []


def test_runtime_values_have_expected_types():
    assert isinstance(config.RATE_LIMIT_PER_MIN, int)
    assert isinstance(config.GRADE_TIMEOUT, int)
    assert isinstance(config.MAX_AUDIO_BYTES, int)
    assert isinstance(config.ALLOWED_ORIGINS, list)
    assert config.GRADER_PROVIDER
    assert config.GRADER_MODEL
