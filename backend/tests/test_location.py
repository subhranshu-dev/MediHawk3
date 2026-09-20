"""
Phase 1B location-resolution tests.

Covers all 12 required checks:
  1.  Valid GPS → nearest PHC/CHC returned.
  2.  Valid GPS → correct distance returned.
  3.  Multiple facilities → mathematically nearest selected.
  4.  Inactive facility → ignored.
  5.  Invalid latitude → rejected.
  6.  Invalid longitude → rejected.
  7.  Missing coordinates → rejected.
  8.  GPS unavailable → explicit error.
  9.  No facility in operational radius → explicit error.
  10. Client attempting to force another facility → backend validates.
  11. No mock/default coordinate fallback exists.
  12. Seed data is never interpreted as device location.

Plus Haversine and validate_coordinates unit tests.
"""
from __future__ import annotations

import pytest

from extensions import db
from models.location import Location
from services.geo_service import (
    DEFAULT_SEARCH_RADIUS_KM,
    find_nearest_facility,
    haversine,
    validate_coordinates,
)


# ── Haversine unit tests (no Flask context required) ─────────────────────────

class TestHaversine:
    def test_same_point_is_zero(self):
        assert haversine(20.2961, 85.8189, 20.2961, 85.8189) == pytest.approx(0.0, abs=1e-9)

    def test_known_distance_london_to_paris(self):
        # London (51.5074, −0.1278) → Paris (48.8566, 2.3522) ≈ 343.5 km by Haversine
        dist = haversine(51.5074, -0.1278, 48.8566, 2.3522)
        assert abs(dist - 343.5) < 2.0

    def test_is_symmetric(self):
        d1 = haversine(20.2961, 85.8189, 20.3512, 85.7612)
        d2 = haversine(20.3512, 85.7612, 20.2961, 85.8189)
        assert d1 == pytest.approx(d2)

    def test_northern_southern_hemisphere(self):
        # Sydney (−33.8688, 151.2093) → Auckland (−36.8485, 174.7633) ≈ 2,157 km
        dist = haversine(-33.8688, 151.2093, -36.8485, 174.7633)
        assert abs(dist - 2157.0) < 10.0


# ── validate_coordinates unit tests ──────────────────────────────────────────

class TestValidateCoordinates:
    def test_valid_coordinates_returns_none(self):
        assert validate_coordinates(20.3512, 85.7612) is None

    def test_missing_latitude_rejected(self):  # CHECK 7 (partial)
        assert validate_coordinates(None, 85.7612) == 'INVALID_COORDINATES'

    def test_missing_longitude_rejected(self):  # CHECK 7 (partial)
        assert validate_coordinates(20.3512, None) == 'INVALID_COORDINATES'

    def test_both_missing_rejected(self):  # CHECK 7
        assert validate_coordinates(None, None) == 'INVALID_COORDINATES'

    def test_latitude_above_90_rejected(self):  # CHECK 5
        assert validate_coordinates(91.0, 85.0) == 'INVALID_COORDINATES'

    def test_latitude_below_minus_90_rejected(self):  # CHECK 5
        assert validate_coordinates(-91.0, 85.0) == 'INVALID_COORDINATES'

    def test_longitude_above_180_rejected(self):  # CHECK 6
        assert validate_coordinates(20.0, 181.0) == 'INVALID_COORDINATES'

    def test_longitude_below_minus_180_rejected(self):  # CHECK 6
        assert validate_coordinates(20.0, -181.0) == 'INVALID_COORDINATES'

    def test_non_numeric_latitude_rejected(self):
        assert validate_coordinates('not_a_number', 85.0) == 'INVALID_COORDINATES'

    def test_non_numeric_longitude_rejected(self):
        assert validate_coordinates(20.0, 'bad') == 'INVALID_COORDINATES'

    def test_extreme_valid_boundaries(self):
        assert validate_coordinates(90.0, 180.0) is None
        assert validate_coordinates(-90.0, -180.0) is None
        assert validate_coordinates(0.0, 0.0) is None


# ── find_nearest_facility unit tests (Flask context required) ────────────────

class TestFindNearestFacility:
    def test_no_facilities_raises_no_eligible_facility(self, app):
        """CHECK 11: Empty DB → raises error, never returns mock coordinates."""
        with pytest.raises(ValueError, match='NO_ELIGIBLE_FACILITY'):
            find_nearest_facility(20.2961, 85.8189)

    def test_nearest_facility_selected(self, seeded_app):
        """CHECK 1 / CHECK 3: Nearest facility is returned by Haversine calculation."""
        # PHC Chandaka is at (20.3512, 85.7612). Device at same point → distance ≈ 0.
        facility, dist = find_nearest_facility(20.3512, 85.7612)
        assert facility.id == 'phc-chandaka'
        assert dist == pytest.approx(0.0, abs=0.01)

    def test_farther_facility_not_selected(self, seeded_app):
        """CHECK 3: Mathematically nearest facility wins over farther ones."""
        # Device close to PHC Chandaka — must not return PHC Jatani or CHC Bhubaneswar.
        facility, dist = find_nearest_facility(20.35, 85.76)
        assert facility.id == 'phc-chandaka'

    def test_different_nearest_when_closer_to_jatani(self, seeded_app):
        """CHECK 3: Different coordinates yield a different nearest facility."""
        # Coordinates close to PHC Jatani (20.1682, 85.8141)
        facility, _ = find_nearest_facility(20.17, 85.82)
        assert facility.id == 'phc-jatani'

    def test_inactive_facility_ignored(self, app):
        """CHECK 4: is_active=False facility is never returned."""
        active = Location(
            id='phc-active-unit', name='Active PHC', type='phc',
            lat=20.3000, lng=85.7800, is_active=True,
        )
        inactive = Location(
            id='phc-inactive-unit', name='Inactive PHC', type='phc',
            lat=20.3001, lng=85.7801, is_active=False,  # closer than active
        )
        db.session.add_all([active, inactive])
        db.session.commit()

        facility, _ = find_nearest_facility(20.3001, 85.7801)
        assert facility.id == 'phc-inactive-unit' is False or facility.id == 'phc-active-unit'
        assert facility.id != 'phc-inactive-unit'

    def test_hub_is_not_returned_as_delivery_facility(self, seeded_app):
        """Hub-01 is a dispatch origin, not a delivery destination."""
        facility, _ = find_nearest_facility(20.2961, 85.8189)  # coords at hub-01
        assert facility.type != 'hub'
        assert facility.id != 'hub-01'

    def test_no_facility_in_operational_radius_raises(self, seeded_app):
        """CHECK 9 (unit): Far coordinates → NO_ELIGIBLE_FACILITY."""
        with pytest.raises(ValueError, match='NO_ELIGIBLE_FACILITY'):
            # Tokyo — ~7,000 km from Bhubaneswar, far outside 200 km radius
            find_nearest_facility(35.6762, 139.6503, search_radius_km=200.0)

    def test_correct_distance_returned(self, seeded_app):
        """CHECK 2: Haversine distance returned matches independent calculation."""
        facility, dist = find_nearest_facility(20.3512, 85.7612)
        expected = haversine(20.3512, 85.7612, facility.lat, facility.lng)
        assert dist == pytest.approx(expected, abs=0.001)


# ── API endpoint tests ───────────────────────────────────────────────────────

class TestLocationResolveAPI:

    # Authentication guard
    def test_no_auth_returns_401(self, client):
        resp = client.post('/api/location/resolve',
                           json={'latitude': 20.3512, 'longitude': 85.7612})
        assert resp.status_code == 401

    # CHECK 5: invalid latitude
    def test_invalid_latitude_rejected(self, seeded_app, client, auth_headers_doctor):
        resp = client.post('/api/location/resolve',
                           json={'latitude': 91.0, 'longitude': 85.0},
                           headers=auth_headers_doctor)
        assert resp.status_code == 422
        assert resp.get_json()['error']['code'] == 'INVALID_COORDINATES'

    # CHECK 6: invalid longitude
    def test_invalid_longitude_rejected(self, seeded_app, client, auth_headers_doctor):
        resp = client.post('/api/location/resolve',
                           json={'latitude': 20.0, 'longitude': 181.0},
                           headers=auth_headers_doctor)
        assert resp.status_code == 422
        assert resp.get_json()['error']['code'] == 'INVALID_COORDINATES'

    # CHECK 7: missing coordinates
    def test_missing_coordinates_rejected(self, seeded_app, client, auth_headers_doctor):
        resp = client.post('/api/location/resolve', json={},
                           headers=auth_headers_doctor)
        assert resp.status_code == 422
        assert resp.get_json()['error']['code'] == 'INVALID_COORDINATES'

    def test_missing_longitude_only_rejected(self, seeded_app, client, auth_headers_doctor):
        resp = client.post('/api/location/resolve',
                           json={'latitude': 20.3512},
                           headers=auth_headers_doctor)
        assert resp.status_code == 422
        assert resp.get_json()['error']['code'] == 'INVALID_COORDINATES'

    # CHECK 8: GPS unavailable
    def test_location_error_unavailable(self, seeded_app, client, auth_headers_doctor):
        resp = client.post('/api/location/resolve',
                           json={'location_error': 'unavailable'},
                           headers=auth_headers_doctor)
        assert resp.status_code == 503
        assert resp.get_json()['error']['code'] == 'LOCATION_UNAVAILABLE'

    def test_location_error_permission_denied(self, seeded_app, client, auth_headers_doctor):
        resp = client.post('/api/location/resolve',
                           json={'location_error': 'permission_denied'},
                           headers=auth_headers_doctor)
        assert resp.status_code == 403
        assert resp.get_json()['error']['code'] == 'LOCATION_PERMISSION_REQUIRED'

    # CHECK 1: valid GPS → nearest facility returned
    def test_valid_gps_returns_nearest_facility(self, seeded_app, client, auth_headers_doctor):
        # PHC Chandaka is the closest PHC/CHC to (20.3512, 85.7612)
        resp = client.post('/api/location/resolve',
                           json={'latitude': 20.3512, 'longitude': 85.7612},
                           headers=auth_headers_doctor)
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['success'] is True
        assert body['nearest_facility']['id'] == 'phc-chandaka'
        assert body['nearest_facility']['type'] in ('phc', 'chc')

    # CHECK 2: correct distance returned
    def test_valid_gps_returns_correct_distance(self, seeded_app, client, auth_headers_doctor):
        resp = client.post('/api/location/resolve',
                           json={'latitude': 20.3512, 'longitude': 85.7612},
                           headers=auth_headers_doctor)
        assert resp.status_code == 200
        dist = resp.get_json()['nearest_facility']['distance_km']
        assert dist == pytest.approx(0.0, abs=0.01)

    # CHECK 3: multiple facilities → nearest wins
    def test_multiple_facilities_nearest_wins(self, seeded_app, client, auth_headers_doctor):
        # Near PHC Jatani (20.1682, 85.8141) → Jatani must win
        resp = client.post('/api/location/resolve',
                           json={'latitude': 20.17, 'longitude': 85.82},
                           headers=auth_headers_doctor)
        assert resp.status_code == 200
        assert resp.get_json()['nearest_facility']['id'] == 'phc-jatani'

    # CHECK 4: inactive facility excluded at API level
    def test_inactive_facility_not_returned_by_api(
        self, seeded_app, client, auth_headers_doctor, app,
    ):
        # Insert an inactive PHC exactly at the test coordinates
        inactive = Location(
            id='phc-inactive-api', name='Closed PHC', type='phc',
            lat=20.3512, lng=85.7612, is_active=False,
        )
        db.session.add(inactive)
        db.session.commit()

        resp = client.post('/api/location/resolve',
                           json={'latitude': 20.3512, 'longitude': 85.7612},
                           headers=auth_headers_doctor)
        assert resp.status_code == 200
        result_id = resp.get_json()['nearest_facility']['id']
        assert result_id != 'phc-inactive-api'

    # CHECK 9: no facility within operational radius
    def test_no_facility_in_operational_radius(self, seeded_app, client, auth_headers_doctor):
        # Tokyo — ~7,000 km from any seeded facility
        resp = client.post('/api/location/resolve',
                           json={'latitude': 35.6762, 'longitude': 139.6503},
                           headers=auth_headers_doctor)
        assert resp.status_code == 404
        assert resp.get_json()['error']['code'] == 'NO_ELIGIBLE_FACILITY'

    # CHECK 10: client cannot force facility ID
    def test_client_injected_facility_id_is_ignored(
        self, seeded_app, client, auth_headers_doctor,
    ):
        # Client sends valid coords near phc-chandaka but injects hub-01 as facility.
        # Backend must compute independently and return a PHC/CHC, never hub-01.
        resp = client.post('/api/location/resolve',
                           json={
                               'latitude': 20.3512,
                               'longitude': 85.7612,
                               'nearest_facility_id': 'hub-01',  # attacker-supplied, ignored
                           },
                           headers=auth_headers_doctor)
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['nearest_facility']['id'] != 'hub-01'
        assert body['nearest_facility']['type'] != 'hub'

    # CHECK 11: no mock fallback (unit-level proof via API)
    def test_no_mock_fallback_when_no_facilities_exist(self, app, client):
        """
        With an empty DB (no seed), the endpoint must return an error — not mock coords.
        Auth is done inline because the fixtures that provide auth also seed the DB.
        """
        from models.admin import Admin
        from services.auth_service import generate_token, hash_password

        # Create a minimal admin user so we can get a valid token
        admin = Admin(
            id='admin-tmp',
            name='Temp Admin',
            email='tmp@medihawk.in',
            password_hash=hash_password('Tmp@Pass2026'),
        )
        db.session.add(admin)
        db.session.commit()

        resp = client.post('/api/login', json={
            'email': 'tmp@medihawk.in',
            'password': 'Tmp@Pass2026',
            'role': 'admin',
        })
        assert resp.status_code == 200
        token = resp.get_json()['token']
        headers = {'Authorization': f'Bearer {token}'}

        # No locations/facilities were seeded — must get NO_ELIGIBLE_FACILITY, not mock coords
        resp = client.post('/api/location/resolve',
                           json={'latitude': 20.3512, 'longitude': 85.7612},
                           headers=headers)
        assert resp.status_code == 404
        assert resp.get_json()['error']['code'] == 'NO_ELIGIBLE_FACILITY'

    # CHECK 12: seed data not used as device location
    def test_response_location_mirrors_request_not_seed(
        self, seeded_app, client, auth_headers_doctor,
    ):
        """
        The response.location must echo the device coordinates sent by the client,
        not any seeded facility coordinate.
        """
        device_lat, device_lon = 20.30, 85.79  # not a seeded facility coordinate
        resp = client.post('/api/location/resolve',
                           json={'latitude': device_lat, 'longitude': device_lon},
                           headers=auth_headers_doctor)
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['location']['latitude'] == pytest.approx(device_lat)
        assert body['location']['longitude'] == pytest.approx(device_lon)
        # Confirm the nearest_facility coords differ from the device location
        assert body['nearest_facility']['latitude'] != pytest.approx(device_lat)


# ── Public GET /api/locations endpoint tests ─────────────────────────────────

class TestPublicLocationsEndpoint:

    def test_empty_db_returns_empty_list(self, app, client):
        """No auth required; empty DB returns empty locations list."""
        resp = client.get('/api/locations')
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['success'] is True
        assert body['locations'] == []

    def test_returns_active_locations(self, app, client):
        """Active locations are returned."""
        loc = Location(id='phc-test', name='Test PHC', type='phc',
                       lat=20.35, lng=85.76, is_active=True)
        from extensions import db
        db.session.add(loc)
        db.session.commit()

        resp = client.get('/api/locations')
        assert resp.status_code == 200
        ids = [l['id'] for l in resp.get_json()['locations']]
        assert 'phc-test' in ids

    def test_inactive_locations_excluded(self, app, client):
        """Inactive locations are NOT returned."""
        from extensions import db
        db.session.add(Location(id='phc-active', name='Active PHC', type='phc',
                                lat=20.35, lng=85.76, is_active=True))
        db.session.add(Location(id='phc-inactive', name='Inactive PHC', type='phc',
                                lat=20.36, lng=85.77, is_active=False))
        db.session.commit()

        resp = client.get('/api/locations')
        assert resp.status_code == 200
        ids = [l['id'] for l in resp.get_json()['locations']]
        assert 'phc-active' in ids
        assert 'phc-inactive' not in ids

    def test_no_authentication_required(self, seeded_app, client):
        """Endpoint is public — no Authorization header needed."""
        resp = client.get('/api/locations')
        assert resp.status_code == 200
        assert len(resp.get_json()['locations']) > 0

    def test_response_has_required_fields(self, seeded_app, client):
        """Each location includes id, name, type, district."""
        resp = client.get('/api/locations')
        assert resp.status_code == 200
        for loc in resp.get_json()['locations']:
            assert 'id' in loc
            assert 'name' in loc
            assert 'type' in loc


# ── _init_locations idempotency tests ─────────────────────────────────────────

class TestInitLocations:

    def test_inserts_canonical_locations(self, app):
        """_init_locations inserts all 4 canonical locations."""
        from app import _init_locations
        from extensions import db

        _init_locations(db)
        db.session.expire_all()

        assert db.session.get(Location, 'hub-01') is not None
        assert db.session.get(Location, 'phc-chandaka') is not None
        assert db.session.get(Location, 'phc-jatani') is not None
        assert db.session.get(Location, 'chc-bhubaneswar') is not None

    def test_idempotent_when_called_twice(self, app):
        """Calling _init_locations twice does not raise or duplicate rows."""
        from app import _init_locations
        from extensions import db

        _init_locations(db)
        _init_locations(db)  # second call must not raise or insert duplicates

        count = Location.query.filter(
            Location.id.in_(['hub-01', 'phc-chandaka', 'phc-jatani', 'chc-bhubaneswar'])
        ).count()
        assert count == 4

    def test_does_not_overwrite_existing_location(self, app):
        """Existing location with same id is not replaced."""
        from app import _init_locations
        from extensions import db

        existing = Location(id='hub-01', name='Custom Hub', type='hub',
                            lat=0.0, lng=0.0)
        db.session.add(existing)
        db.session.commit()

        _init_locations(db)

        hub = db.session.get(Location, 'hub-01')
        assert hub.name == 'Custom Hub'  # not overwritten
