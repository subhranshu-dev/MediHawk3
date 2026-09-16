"""
Structured logging configuration for MediHawk backend.
NEVER log: passwords, JWT tokens, OTPs, API keys, or patient PII.
"""
import logging
import sys
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from flask import Flask


def configure_logging(app: 'Flask') -> None:
    """Configure Flask app logger and root logger."""
    level_name = app.config.get('LOG_LEVEL', 'INFO').upper()
    level = getattr(logging, level_name, logging.INFO)

    formatter = logging.Formatter(
        fmt='%(asctime)s | %(levelname)-8s | %(name)-30s | %(message)s',
        datefmt='%Y-%m-%dT%H:%M:%S',
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    handler.setLevel(level)

    # Flask app logger
    app.logger.handlers.clear()
    app.logger.addHandler(handler)
    app.logger.setLevel(level)
    app.logger.propagate = False

    # Root logger (catches third-party library logs)
    root = logging.getLogger()
    if not root.handlers:
        root.addHandler(handler)
    root.setLevel(level)

    # Silence noisy third-party loggers
    logging.getLogger('werkzeug').setLevel(logging.WARNING)
