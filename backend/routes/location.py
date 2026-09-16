"""
Location resolution routes.

POST /api/location/resolve
    Given device GPS coordinates (from the browser/device), returns the nearest
    eligible active PHC or CHC.

Security contract:
  - Requires a valid JWT (doctor or admin).
  - Coordinates must originate from the device; the backend never trusts
    a client-supplied facility ID as authoritative.
  - No mock or hardcoded fallback coordinates are ever used.
  - If the client signals a location error, an explicit error code is returned.
  - The backend independently calculates the nearest facility from stored
    facility coordinates using the Haversine formula.
"""
from __future__ import annotations

import logging

from flask import Blueprint, g, jsonify, request

from middleware.auth import require_auth
from services.geo_service import find_nearest_facility, validate_coordinates
from utils.response import error

location_bp = Blueprint('location', __name__)
logger = logging.getLogger(__name__)

_LOCATION_ERROR_MAP: dict[str, tuple[str, str, int]] = {
    'permission_denied': (
        'LOCATION_PERMISSION_REQUIRED',
        'Location permission was denied by the device. '
        'Enable location access in your browser/device settings and retry.',
        403,
    ),
    'unavailable': (
        'LOCATION_UNAVAILABLE',
        'Device location is currently unavailable. '
        'Ensure GPS or location services are enabled.',
        503,
    ),
}


@location_bp.route('/api/location/resolve', methods=['POST'])
@require_auth
def resolve_location():
    """
    Resolve device GPS coordinates to the nearest eligible PHC or CHC.

    Accepts either:
      { "latitude": <float>, "longitude": <float> }
    or a device-side error signal:
      { "location_error": "permission_denied" | "unavailable" }

    A client-supplied "nearest_facility_id" field is silently ignored —
    the backend always calculates the nearest facility independently.

    Returns:
      {
        "success": true,
        "location": { "latitude": <float>, "longitude": <float> },
        "nearest_facility": {
          "id": "...", "name": "...", "type": "phc|chc",
          "latitude": <float>, "longitude": <float>, "distance_km": <float>
        }
      }
    """
    data = request.get_json(silent=True) or {}

    # Client signals that the device could not obtain location.
    # These are forwarded as explicit errors — no silent fallback.
    loc_err = data.get('location_error')
    if loc_err:
        mapped = _LOCATION_ERROR_MAP.get(loc_err)
        if mapped:
            code, msg, status = mapped
        else:
            code, msg, status = (
                'LOCATION_UNAVAILABLE',
                'Device location is unavailable.',
                503,
            )
        return error(code, msg, status)

    lat = data.get('latitude')
    lon = data.get('longitude')

    coord_err = validate_coordinates(lat, lon)
    if coord_err:
        return error(
            'INVALID_COORDINATES',
            'Latitude must be in −90..90 and longitude in −180..180.',
            422,
        )

    lat_f = float(lat)
    lon_f = float(lon)

    try:
        facility, distance_km = find_nearest_facility(lat_f, lon_f)
    except ValueError as exc:
        if str(exc) == 'NO_ELIGIBLE_FACILITY':
            return error(
                'NO_ELIGIBLE_FACILITY',
                'No operational PHC or CHC was found within the service area. '
                'Contact MediHawk support.',
                404,
            )
        return error('LOCATION_UNAVAILABLE', 'Could not resolve nearest facility.', 503)

    logger.info(
        'Location resolved: user=%s lat=%.5f lon=%.5f → facility=%s dist=%.2f km',
        g.user_id, lat_f, lon_f, facility.id, distance_km,
    )

    return jsonify({
        'success': True,
        'location': {
            'latitude': lat_f,
            'longitude': lon_f,
        },
        'nearest_facility': {
            'id': facility.id,
            'name': facility.name,
            'type': facility.type,
            'latitude': facility.lat,
            'longitude': facility.lng,
            'distance_km': distance_km,
        },
    }), 200
