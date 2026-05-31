"""Shared logger that always writes to stdout (visible in the uvicorn console),
independent of uvicorn's own logging config."""

from __future__ import annotations

import logging
import os
import sys

log = logging.getLogger("civic")
if not log.handlers:
    _h = logging.StreamHandler(sys.stdout)
    _h.setFormatter(
        logging.Formatter("%(asctime)s [civic] %(levelname)s %(message)s", "%H:%M:%S")
    )
    log.addHandler(_h)
    log.setLevel(getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO))
    log.propagate = False
