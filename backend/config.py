"""
Configuration classes for MediHawk backend.
Uses environment variables via python-dotenv. Never hard-code secrets here.
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).parent


class BaseConfig:
    # ── Secrets (MUST be set from environment in production) ──────────────────
    SECRET_KEY: str = os.environ.get('SECRET_KEY', 'CHANGE-IN-PRODUCTION-dev-only')
    JWT_SECRET_KEY: str = os.environ.get('JWT_SECRET_KEY', 'JWT-CHANGE-IN-PRODUCTION-dev-only')
    JWT_EXPIRY_HOURS: int = int(os.environ.get('JWT_EXPIRY_HOURS', '8'))

    # ── Database ──────────────────────────────────────────────────────────────
    _db_path = os.environ.get('DATABASE_PATH', str(BASE_DIR / 'instance' / 'medihawk.db'))
    SQLALCHEMY_DATABASE_URI: str = f'sqlite:///{_db_path}'
    SQLALCHEMY_TRACK_MODIFICATIONS: bool = False

    # ── Application mode boundary ─────────────────────────────────────────────
    # 'simulation' = demo mode, no real hardware. 'live' = real drone (Phase 2+).
    # Real MAVProxy commands must never execute unless APP_MODE == 'live'.
    APP_MODE: str = os.environ.get('APP_MODE', 'simulation')

    # ── CORS ──────────────────────────────────────────────────────────────────
    CORS_ORIGINS: list[str] = [
        o.strip()
        for o in os.environ.get('CORS_ORIGINS', 'http://localhost:5173,http://localhost:4173').split(',')
        if o.strip()
    ]

    # ── OTP ───────────────────────────────────────────────────────────────────
    OTP_EXPIRY_SECONDS: int = int(os.environ.get('OTP_EXPIRY_SECONDS', '300'))     # 5 min
    OTP_MAX_ATTEMPTS: int = int(os.environ.get('OTP_MAX_ATTEMPTS', '5'))
    OTP_RESEND_COOLDOWN_SECONDS: int = int(os.environ.get('OTP_RESEND_COOLDOWN_SECONDS', '60'))
    OTP_MAX_REQUESTS_PER_HOUR: int = int(os.environ.get('OTP_MAX_REQUESTS_PER_HOUR', '10'))
    # Keyed secret for HMAC-SHA256 OTP hashing. Must be set from env in production.
    OTP_HMAC_SECRET: str = os.environ.get('OTP_HMAC_SECRET', 'otp-hmac-dev-only-change-in-production')

    # ── SMTP ──────────────────────────────────────────────────────────────────
    SMTP_HOST: str = os.environ.get('SMTP_HOST', '')
    SMTP_PORT: int = int(os.environ.get('SMTP_PORT', '587'))
    SMTP_USERNAME: str = os.environ.get('SMTP_USERNAME', '')
    SMTP_PASSWORD: str = os.environ.get('SMTP_PASSWORD', '')
    SMTP_FROM_EMAIL: str = os.environ.get('SMTP_FROM_EMAIL', '')
    SMTP_FROM_NAME: str = os.environ.get('SMTP_FROM_NAME', 'MediHawk')
    SMTP_USE_TLS: bool = os.environ.get('SMTP_USE_TLS', 'true').lower() == 'true'

    # ── Admin signup (invite-code controlled) ─────────────────────────────────
    # Must be set to a strong random value in production.
    # Empty string disables admin self-registration entirely.
    ADMIN_INVITE_CODE: str = os.environ.get('ADMIN_INVITE_CODE', '')

    # ── Password policy ───────────────────────────────────────────────────────
    PASSWORD_MIN_LENGTH: int = int(os.environ.get('PASSWORD_MIN_LENGTH', '8'))
    PASSWORD_RESET_EXPIRY_MINUTES: int = int(os.environ.get('PASSWORD_RESET_EXPIRY_MINUTES', '15'))

    # ── Logging ───────────────────────────────────────────────────────────────
    LOG_LEVEL: str = os.environ.get('LOG_LEVEL', 'INFO')


class DevelopmentConfig(BaseConfig):
    DEBUG: bool = True
    LOG_LEVEL: str = 'DEBUG'


class TestingConfig(BaseConfig):
    TESTING: bool = True
    # In-memory DB for tests — never touches the real database file
    SQLALCHEMY_DATABASE_URI: str = 'sqlite:///:memory:'
    APP_MODE: str = 'testing'
    # Stable secrets so tests are deterministic
    SECRET_KEY: str = 'test-secret-not-for-production'
    JWT_SECRET_KEY: str = 'test-jwt-secret-not-for-production'
    # Shorter expiry for token-expiry tests
    JWT_EXPIRY_HOURS: int = 1
    WTF_CSRF_ENABLED: bool = False


class ProductionConfig(BaseConfig):
    DEBUG: bool = False

    @property
    def SECRET_KEY(self) -> str:  # type: ignore[override]
        key = os.environ.get('SECRET_KEY')
        if not key:
            raise RuntimeError('SECRET_KEY environment variable must be set in production.')
        return key

    @property
    def JWT_SECRET_KEY(self) -> str:  # type: ignore[override]
        key = os.environ.get('JWT_SECRET_KEY')
        if not key:
            raise RuntimeError('JWT_SECRET_KEY environment variable must be set in production.')
        return key


_CONFIG_MAP: dict[str, type[BaseConfig]] = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
}


def get_config(env: str | None = None) -> type[BaseConfig]:
    """Return config class for the given environment name."""
    env = env or os.environ.get('FLASK_ENV', 'development')
    return _CONFIG_MAP.get(env, DevelopmentConfig)
