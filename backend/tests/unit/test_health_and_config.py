"""Unit tests for Health, Readiness, and App configuration."""

from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from app.core.config import settings


def test_health_endpoint(client: TestClient):
    """Verify /health is the lightweight liveness probe (always HTTP 200)."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "version" in data
    assert "timestamp" in data


def test_ready_endpoint_test_mode(client: TestClient):
    """Verify /ready in test environment reports database status."""
    response = client.get("/ready")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ["ready", "degraded"]
    assert "dependencies" in data
    assert data["dependencies"]["database"] == "connected"


def test_ready_endpoint_database_failure(client: TestClient):
    """Verify database connection failure causes /ready to return HTTP 503."""
    with patch("app.api.health.engine.connect", side_effect=Exception("Database connection timeout")):
        response = client.get("/ready")
        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "degraded"
        assert "unhealthy" in data["dependencies"]["database"]


def test_ready_endpoint_redis_failure_in_production(client: TestClient, monkeypatch):
    """Verify Redis failure in production produces HTTP 503."""
    monkeypatch.setattr(settings, "APP_ENV", "production")
    
    with patch("redis.from_url") as mock_redis:
        mock_instance = MagicMock()
        mock_instance.ping.side_effect = Exception("Connection refused to Redis")
        mock_redis.return_value = mock_instance
        
        response = client.get("/ready")
        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "degraded"
        assert "unreachable" in data["dependencies"]["redis"]


def test_ready_endpoint_qdrant_failure_in_production(client: TestClient, monkeypatch):
    """Verify Qdrant failure in production produces HTTP 503."""
    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "QDRANT_URL", "https://qdrant.cluster.example:6333")
    
    with patch("qdrant_client.QdrantClient") as mock_qc:
        mock_instance = MagicMock()
        mock_instance.get_collections.side_effect = Exception("Qdrant cluster unavailable")
        mock_qc.return_value = mock_instance
        
        response = client.get("/ready")
        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "degraded"
        assert "unreachable" in data["dependencies"]["qdrant"]


def test_ready_endpoint_all_healthy_in_production(client: TestClient, monkeypatch):
    """Verify /ready returns HTTP 200 when all dependencies are healthy in production."""
    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "QDRANT_URL", "https://qdrant.cluster.example:6333")
    monkeypatch.setattr(settings, "REDIS_URL", "redis://redis.railway.internal:6379")
    
    with patch("redis.from_url") as mock_redis, patch("qdrant_client.QdrantClient") as mock_qc:
        mock_r = MagicMock()
        mock_r.ping.return_value = True
        mock_redis.return_value = mock_r
        
        mock_q = MagicMock()
        mock_q.get_collections.return_value = MagicMock()
        mock_qc.return_value = mock_q
        
        response = client.get("/ready")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ready"
        assert data["dependencies"]["database"] == "connected"
        assert data["dependencies"]["redis"] == "connected"
        assert data["dependencies"]["qdrant"] == "connected"


def test_root_endpoint(client: TestClient):
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "DecisionTrace" in data["app"]
    assert data["health"] == "/health"
