"""
Identifier normalization utilities.
All lookups must use canonical forms to prevent mismatch across input variations.
"""
from __future__ import annotations

import re


def normalize_email(email: str) -> str:
    """Strip surrounding whitespace and lowercase. Never raises."""
    return email.strip().lower()


def normalize_phone(phone: str) -> str | None:
    """
    Return a canonical 10-digit Indian mobile number, or None if not recognizable.

    Accepted input formats (all normalize to e.g. '9861234567'):
        9861234567          (10 digits)
        +91 9861234567      (international prefix with space)
        +919861234567       (international prefix, no space)
        919861234567        (country code without +)
        09861234567         (leading 0, domestic trunk prefix)
        98612 34567         (spacing within number — stripped)
    """
    digits = re.sub(r'\D', '', phone)
    if len(digits) == 10:
        return digits
    if len(digits) == 12 and digits.startswith('91'):
        return digits[2:]
    if len(digits) == 11 and digits.startswith('0'):
        return digits[1:]
    return None
