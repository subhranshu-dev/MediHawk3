"""
Geographic distance and nearest-facility resolution service.

Uses the Haversine formula for Earth-surface great-circle distance.

Rules enforced here:
  - Only active PHC/CHC facilities are eligible delivery destinations.
  - Hubs are dispatch origin points, not delivery destinations.
  - No mock, hardcoded, or seeded coordinates are ever used as the device location.
  - If no facility is within the search radius, ValueError('NO_ELIGIBLE_FACILITY') is raised.
  - Callers must validate coordinates before passing them here.
"""
from __future__ import annotations

import math

EARTH_RADIUS_KM: float = 6371.0

# Maximum search radius. Facilities farther than this are not considered eligible.
DEFAULT_SEARCH_RADIUS_KM: float = 200.0

# Only these location types are valid delivery destinations.
# Hubs are the dispatch origin — they appear in the DB but are not returned
# as a nearest delivery facility.
DELIVERY_TYPES: frozenset[str] = frozenset({'phc', 'chc'})


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great-circle distance between two points on Earth (km).
    Inputs are decimal degrees. Both hemispheres handled correctly.
    """
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    )
    return 2.0 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def validate_coordinates(lat, lon) -> str | None:
    """
    Validate that lat/lon are present and within legal geographic bounds.
    Returns None if valid, or the error-code string 'INVALID_COORDINATES' if not.
    """
    if lat is None or lon is None:
        return 'INVALID_COORDINATES'
    try:
        lat_f = float(lat)
        lon_f = float(lon)
    except (ValueError, TypeError):
        return 'INVALID_COORDINATES'
    if not (-90.0 <= lat_f <= 90.0):
        return 'INVALID_COORDINATES'
    if not (-180.0 <= lon_f <= 180.0):
        return 'INVALID_COORDINATES'
    return None


def find_nearest_facility(
    device_lat: float,
    device_lon: float,
    search_radius_km: float = DEFAULT_SEARCH_RADIUS_KM,
) -> tuple:
    """
    Find the nearest active PHC or CHC to the given device coordinates.

    Parameters
    ----------
    device_lat, device_lon : float
        Coordinates from the user's device. Caller is responsible for
        validating these before passing them in.
    search_radius_km : float
        Maximum acceptable distance. Facilities beyond this are excluded.

    Returns
    -------
    (Location, distance_km) — the nearest eligible facility and its distance.

    Raises
    ------
    ValueError('NO_ELIGIBLE_FACILITY')
        When no active PHC/CHC exists in the DB, or none is within search_radius_km.

    This function NEVER falls back to mock coordinates. If no facility is
    found, it raises rather than returning a default.
    """
    from models.location import Location

    facilities = Location.query.filter(
        Location.is_active == True,  # noqa: E712
        Location.type.in_(list(DELIVERY_TYPES)),
    ).all()

    if not facilities:
        raise ValueError('NO_ELIGIBLE_FACILITY')

    nearest = None
    nearest_dist = float('inf')

    for facility in facilities:
        if facility.lat is None or facility.lng is None:
            continue
        dist = haversine(device_lat, device_lon, facility.lat, facility.lng)
        if dist < nearest_dist:
            nearest_dist = dist
            nearest = facility

    if nearest is None:
        raise ValueError('NO_ELIGIBLE_FACILITY')

    if nearest_dist > search_radius_km:
        raise ValueError('NO_ELIGIBLE_FACILITY')

    return nearest, round(nearest_dist, 3)
