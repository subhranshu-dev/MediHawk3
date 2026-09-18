"""
Configuration classes for MediHawk backend.
Uses environment variables via python-dotenv. Never hard-code secrets here.

Database resolution priority:
  TESTING        → sqlite:///:memory:
  DATABASE_URL   → PostgreSQL (or other URL provided)
  DATABASE_PATH  → SQLite (development fallback)

Production REQUIRES DATABASE_URL to be a PostgreSQL URL.
Render provides DATABASE_URL automatically.
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).parent


def _normalise_db_url(url: str) -> str:
    """
    Normalize a PostgreSQL connection URL for SQLAlchemy + psycopg3:
      - postgres://      → postgresql+psycopg://  (Render/Heroku legacy prefix)
      - postgresql://    → postgresql+psycopg://  (standard prefix, add psycopg3 driver)
      - postgresql+psycopg://  → unchanged (already correct)
    psycopg (psycopg3) is the only PostgreSQL driver in requirements.txt.
    """
    if url.startswith('postgresql+'):
        return url  # already has driver specifier
    if url.startswith('postgres://'):
        return 'postgresql+psycopg' + url[len('postgres'):]
    if url.startswith('postgresql://'):
        return 'postgresql+psycopg' + url[len('postgresql'):]
    return url


def _resolve_db_uri() -> str:
    """
    Compute SQLALCHEMY_DATABASE_URI at module-load time.

    Priority:
      1. DATABASE_URL env var (present in production / CI)
      2. DATABASE_PATH env var → SQLite file
      3. Hardcoded SQLite path relative to BASE_DIR
    """
    raw = os.environ.get('DATABASE_URL', '')
    if raw:
        return _normalise_db_url(raw)
    db_path = os.environ.get('DATABASE_PATH', str(BASE_DIR / 'instance' / 'medihawk.db'))
    return f'sqlite:///{db_path}'


# Compute once at import time so subclasses can reference it
_DEFAULT_DB_URI: str = _resolve_db_uri()


class BaseConfig:
    # ── Secrets (MUST be set from environment in production) ──────────────────
    SECRET_KEY: str = os.environ.get('SECRET_KEY', 'CHANGE-IN-PRODUCTION-dev-only')
    JWT_SECRET_KEY: str = os.environ.get('JWT_SECRET_KEY', 'JWT-CHANGE-IN-PRODUCTION-dev-only')
    JWT_EXPIRY_HOURS: int = int(os.environ.get('JWT_EXPIRY_HOURS', '8'))

    # ── Database ──────────────────────────────────────────────────────────────
    SQLALCHEMY_DATABASE_URI: str = _DEFAULT_DB_URI
    SQLALCHEMY_TRACK_MODIFICATIONS: bool = False

    # Connection pool settings — configurable for Render / multi-worker deployments.
    # SQLite ignores pool settings; they only apply to PostgreSQL.
    DB_POOL_SIZE: int = int(os.environ.get('DB_POOL_SIZE', '5'))
    DB_MAX_OVERFLOW: int = int(os.environ.get('DB_MAX_OVERFLOW', '10'))
    DB_POOL_TIMEOUT: int = int(os.environ.get('DB_POOL_TIMEOUT', '30'))
    DB_POOL_RECYCLE: int = int(os.environ.get('DB_POOL_RECYCLE', '1800'))

    # Build SQLALCHEMY_ENGINE_OPTIONS for PostgreSQL; SQLite uses NullPool / StaticPool.
    @classmethod
    def get_engine_options(cls) -> dict:
        uri = cls.SQLALCHEMY_DATABASE_URI
        if uri.startswith('postgresql'):
            return {
                'pool_pre_ping': True,
                'pool_size': cls.DB_POOL_SIZE,
                'max_overflow': cls.DB_MAX_OVERFLOW,
                'pool_timeout': cls.DB_POOL_TIMEOUT,
                'pool_recycle': cls.DB_POOL_RECYCLE,
            }
        # SQLite: no pool settings needed
        return {}

    # ── Application mode boundary ─────────────────────────────────────────────
    # 'simulation' = demo mode, no real hardware. 'live' = real drone (Phase 2+).
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
    SMTP_USERNAME: str = os.environ.get('SMTP_USERNAME', '').strip()
    # Gmail App Passwords are displayed with spaces ("xxxx xxxx xxxx xxxx").
    # Strip all spaces so both formats ("xxxxxxxxxxxx" and "xxxx xxxx xxxx xxxx")
    # authenticate correctly.  Do not lowercase — passwords are case-sensitive.
    SMTP_PASSWORD: str = os.environ.get('SMTP_PASSWORD', '').replace(' ', '')
    # Default sender to SMTP_USERNAME when SMTP_FROM_EMAIL is not explicitly set.
    # Gmail requires the From address to match the authenticated account.
    SMTP_FROM_EMAIL: str = (
        os.environ.get('SMTP_FROM_EMAIL', '').strip()
        or os.environ.get('SMTP_USERNAME', '').strip()
    )
    SMTP_FROM_NAME: str = os.environ.get('SMTP_FROM_NAME', 'MediHawk').strip()
    SMTP_USE_TLS: bool = os.environ.get('SMTP_USE_TLS', 'true').lower() == 'true'
    # SMTP_USE_SSL=true enables implicit SSL (port 465). Overrides SMTP_USE_TLS.
    # Use when STARTTLS on port 587 is blocked (errno 101 = ENETUNREACH).
    SMTP_USE_SSL: bool = os.environ.get('SMTP_USE_SSL', 'false').lower() in ('true', '1', 'yes')

    # ── HTTPS email provider (fallback when all outbound SMTP ports are blocked) ──
    # EMAIL_PROVIDER=https enables the HTTPS transport instead of SMTP.
    # EMAIL_API_PROVIDER selects the service: 'resend', 'sendgrid', or 'mailgun'.
    EMAIL_PROVIDER: str = os.environ.get('EMAIL_PROVIDER', 'smtp')
    EMAIL_API_PROVIDER: str = os.environ.get('EMAIL_API_PROVIDER', 'resend')
    EMAIL_API_KEY: str = os.environ.get('EMAIL_API_KEY', '')
    EMAIL_API_DOMAIN: str = os.environ.get('EMAIL_API_DOMAIN', '')  # required for Mailgun

    # ── Admin signup (invite-code controlled) ─────────────────────────────────
    ADMIN_INVITE_CODE: str = os.environ.get('ADMIN_INVITE_CODE', '')

    # ── Password policy ───────────────────────────────────────────────────────
    PASSWORD_MIN_LENGTH: int = int(os.environ.get('PASSWORD_MIN_LENGTH', '8'))
    PASSWORD_RESET_EXPIRY_MINUTES: int = int(os.environ.get('PASSWORD_RESET_EXPIRY_MINUTES', '15'))

    # ── Seed control ──────────────────────────────────────────────────────────
    # Set SEED_DEMO_DATA=true to insert development users/drones/locations on startup.
    # Default: false — production starts with an empty schema.
    SEED_DEMO_DATA: bool = os.environ.get('SEED_DEMO_DATA', 'false').lower() == 'true'

    # ── Logging ───────────────────────────────────────────────────────────────
    LOG_LEVEL: str = os.environ.get('LOG_LEVEL', 'INFO')


class DevelopmentConfig(BaseConfig):
    DEBUG: bool = True
    LOG_LEVEL: str = 'DEBUG'


class TestingConfig(BaseConfig):
    TESTING: bool = True
    # Default: in-memory SQLite. Override: set TEST_DATABASE_URL to a postgresql:// URI.
    # The env var is read at class-definition time (module import) so Flask-SQLAlchemy's
    # eager engine creation in init_app() picks up the correct URL.
    SQLALCHEMY_DATABASE_URI: str = (
        _normalise_db_url(os.environ.get('TEST_DATABASE_URL', ''))
        or 'sqlite:///:memory:'
    )
    APP_MODE: str = 'testing'

    @classmethod
    def get_engine_options(cls) -> dict:
        """
        Use NullPool for PostgreSQL tests: each fixture creates a new engine per test,
        so pooled connections accumulate and exhaust PostgreSQL's max_connections.
        NullPool opens and closes connections immediately — no pooling, no exhaustion.
        """
        if cls.SQLALCHEMY_DATABASE_URI.startswith('postgresql'):
            from sqlalchemy.pool import NullPool  # pyright: ignore[reportMissingImports]
            return {'pool_pre_ping': True, 'poolclass': NullPool}
        return {}
    # Stable secrets so tests are deterministic
    SECRET_KEY: str = 'test-secret-not-for-production'
    JWT_SECRET_KEY: str = 'test-jwt-secret-not-for-production'
    # Shorter expiry for token-expiry tests
    JWT_EXPIRY_HOURS: int = 1
    WTF_CSRF_ENABLED: bool = False


class ProductionConfig(BaseConfig):
    DEBUG: bool = False
    # DATABASE_URL is validated at startup in create_app().
    # The URI is already computed via _DEFAULT_DB_URI (inherited from BaseConfig).
    # If DATABASE_URL is absent, startup raises RuntimeError.


_CONFIG_MAP: dict[str, type[BaseConfig]] = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
}


def get_config(env: str | None = None) -> type[BaseConfig]:
    """Return config class for the given environment name."""
    env = env or os.environ.get('FLASK_ENV', 'development')
    return _CONFIG_MAP.get(env, DevelopmentConfig)
