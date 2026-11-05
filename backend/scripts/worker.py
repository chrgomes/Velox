"""Background worker: sends queued emails and prunes rate-limit counters.

Run with ``python -m scripts.worker``. Safe to run more than one copy (rows are claimed with
SKIP LOCKED). Phase 2 adds tracking and webhook jobs; see docs/00-decisions.md D-008.
"""

import logging
import signal
import time

from app.core.logging import configure_logging
from app.core.rate_limit import prune
from app.modules.notifications.service import send_pending

log = logging.getLogger("velox.worker")
_running = True


def _stop(*_: object) -> None:
    global _running
    _running = False


def main(poll_seconds: float = 2.0) -> None:
    configure_logging()
    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)
    log.info("worker started")
    last_prune = 0.0
    while _running:
        try:
            sent = send_pending()
            if sent:
                log.info("sent %s email(s)", sent)
            if time.monotonic() - last_prune > 3600:
                prune()
                last_prune = time.monotonic()
        except Exception:  # noqa: BLE001 - keep the worker alive; errors are logged
            log.exception("worker iteration failed")
        time.sleep(poll_seconds)
    log.info("worker stopped")


if __name__ == "__main__":
    main()
