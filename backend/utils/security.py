"""
Security utilities.
Cryptographically secure OTP generation and ID helpers.
"""
import secrets
import string
from datetime import datetime


def generate_otp(length: int = 6) -> str:
    """
    Generate a cryptographically secure numeric OTP.
    Uses secrets.choice — not random.randint — to ensure uniformity.
    """
    return ''.join(secrets.choice(string.digits) for _ in range(length))


def generate_order_id(year: int, sequence: int) -> str:
    """
    Generate canonical order ID: MH-YYYY-NNNNN
    Server is the only authority for order IDs (Phase-0 §19 mismatch M10).
    """
    return f'MH-{year}-{sequence:05d}'


def generate_mission_id(year: int, sequence: int) -> str:
    """Generate canonical mission ID: MSN-YYYY-NNNNN"""
    return f'MSN-{year}-{sequence:05d}'


def generate_alert_id() -> str:
    """Generate a short unique alert ID."""
    return f'ALT-{secrets.token_hex(6).upper()}'


def current_year() -> int:
    return datetime.utcnow().year
