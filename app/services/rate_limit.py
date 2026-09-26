"""Rate limiting en memoria por API key / aplicación.

Solo se aplica si la key o la aplicación tienen rate_limit_rpm definido.
Funciona con un único worker de uvicorn (la configuración actual). Si en el
futuro hay varios workers, se reemplaza este módulo por uno basado en
PostgreSQL o Redis sin tocar los endpoints.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

_WINDOW_SECONDS = 60.0
_lock = threading.Lock()
_hits: dict[str, deque[float]] = defaultdict(deque)


def allow(bucket: str, limit_per_minute: int | None) -> bool:
    if not limit_per_minute or limit_per_minute <= 0:
        return True
    now = time.monotonic()
    with _lock:
        hits = _hits[bucket]
        while hits and now - hits[0] >= _WINDOW_SECONDS:
            hits.popleft()
        if len(hits) >= limit_per_minute:
            return False
        hits.append(now)
        return True


def reset() -> None:
    with _lock:
        _hits.clear()
