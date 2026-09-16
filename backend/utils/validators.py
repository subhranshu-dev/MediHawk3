"""
Request validation helpers.
Backend is the authoritative validator — never trust frontend validation alone.
"""
from __future__ import annotations


def require_fields(data: dict, fields: list[str]) -> list[str]:
    """Return list of missing required fields. Empty list = all present."""
    return [f for f in fields if not data.get(f)]


def validate_enum(value: str, allowed: tuple[str, ...], field: str) -> str | None:
    """Return error message if value is not in allowed, else None."""
    if value not in allowed:
        return f"'{field}' must be one of: {', '.join(allowed)}. Got: {value!r}"
    return None


def validate_string_length(value: str, field: str, min_len: int = 1, max_len: int = 500) -> str | None:
    """Return error message if string length is out of range, else None."""
    if not isinstance(value, str):
        return f"'{field}' must be a string."
    if len(value) < min_len:
        return f"'{field}' must be at least {min_len} character(s)."
    if len(value) > max_len:
        return f"'{field}' must be at most {max_len} character(s)."
    return None


def validate_positive_int(value: object, field: str) -> str | None:
    """Return error message if value is not a positive integer, else None."""
    if not isinstance(value, int) or isinstance(value, bool) or value < 1:
        return f"'{field}' must be a positive integer."
    return None


def validate_password_strength(password: str, min_length: int = 8) -> str | None:
    """Return error message if password is too weak, else None."""
    if len(password) < min_length:
        return f'Password must be at least {min_length} characters.'
    if not any(c.isalpha() for c in password):
        return 'Password must contain at least one letter.'
    if not any(c.isdigit() for c in password):
        return 'Password must contain at least one digit.'
    return None


ORDER_PRIORITIES = ('emergency', 'urgent', 'normal')
ORDER_STATUSES = ('pending', 'approved', 'preparing', 'launched', 'in_flight',
                  'landing', 'delivered', 'verified', 'cancelled')
USER_ROLES = ('doctor', 'admin')
