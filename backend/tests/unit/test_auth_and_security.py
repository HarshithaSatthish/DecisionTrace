"""Unit tests for Authentication, Clerk JWT validation, and security constraints."""

from fastapi.testclient import TestClient

from app.core.security import generate_webhook_token, hash_webhook_token


def test_missing_auth_header_fails(client: TestClient):
    response = client.get("/api/v1/overview")
    assert response.status_code == 401
    assert "Missing Authorization header" in response.json()["detail"]


def test_malformed_auth_header_fails(client: TestClient):
    response = client.get("/api/v1/overview", headers={"Authorization": "Bearer not-a-valid-token"})
    # Under test mode or non-dev mode, malformed tokens must return 401
    assert response.status_code == 401


def test_token_generation_and_hashing():
    raw_token = generate_webhook_token()
    assert raw_token.startswith("omi_")
    assert len(raw_token) > 30

    hash1 = hash_webhook_token(raw_token)
    hash2 = hash_webhook_token(raw_token)
    assert hash1 == hash2
    assert len(hash1) == 64  # SHA-256 length


def test_dev_mode_valid_user_succeeds(client: TestClient):
    headers = {"Authorization": "Bearer user_test_harshitha_123"}
    response = client.get("/api/v1/overview", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "active_decisions" in data
    assert "total_conversations" in data
