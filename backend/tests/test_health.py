"""
Tests for GET /api/health endpoint.
"""


def test_health_returns_200(client):
    response = client.get('/api/health')
    assert response.status_code == 200


def test_health_json_structure(client):
    data = client.get('/api/health').get_json()
    assert data['success'] is True
    assert data['service'] == 'MediHawk Backend'
    assert data['status'] in ('healthy', 'degraded')
    assert data['mode'] in ('simulation', 'live', 'testing')
    assert data['database'] in ('connected', 'disconnected')
    assert 'version' in data


def test_health_database_connected_in_tests(client):
    """In-memory DB should always be reachable."""
    data = client.get('/api/health').get_json()
    assert data['database'] == 'connected'
    assert data['status'] == 'healthy'


def test_health_mode_is_testing(client):
    """TestingConfig forces APP_MODE = 'testing'."""
    data = client.get('/api/health').get_json()
    assert data['mode'] == 'testing'


def test_health_does_not_expose_secrets(client):
    """Health response must not contain config secrets."""
    data = client.get('/api/health').get_json()
    response_str = str(data)
    for forbidden in ('SECRET_KEY', 'JWT_SECRET', 'password', 'token'):
        assert forbidden.lower() not in response_str.lower(), \
            f'Health endpoint leaked sensitive key: {forbidden}'
