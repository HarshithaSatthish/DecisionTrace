"""Production Clerk JWKS and cryptographic RS256 JWT validation tests."""

import json
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.core.config import Settings, settings
from app.core.security import _jwks_cache, verify_clerk_token


@pytest.fixture(scope="module")
def rsa_keypair():
    """Generate authentic RSA 2048-bit keypair and JWK representation."""
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
        backend=default_backend(),
    )
    public_key = private_key.public_key()

    # Convert public key to JWK
    jwk_str = jwt.algorithms.RSAAlgorithm.to_jwk(public_key)
    jwk_dict = json.loads(jwk_str)
    jwk_dict["kid"] = "clerk_test_key_kid_001"
    jwk_dict["alg"] = "RS256"
    jwk_dict["use"] = "sig"

    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )

    return {
        "private_pem": private_pem,
        "public_key": public_key,
        "jwk": jwk_dict,
        "kid": "clerk_test_key_kid_001",
    }


def test_production_settings_blocks_dev_auth():
    """Verify production environment strictly forbids AUTH_DEV_MODE."""
    with pytest.raises(ValueError, match="AUTH_DEV_MODE cannot be enabled in production"):
        Settings(
            APP_ENV="production",
            AUTH_DEV_MODE=True,
            CLERK_ISSUER="https://clerk.decisiontrace.com",
        )


def test_production_settings_requires_clerk_issuer():
    """Verify production environment strictly requires CLERK_ISSUER or CLERK_JWKS_URL."""
    with pytest.raises(ValueError, match="CLERK_ISSUER or CLERK_JWKS_URL is required"):
        Settings(
            APP_ENV="production",
            AUTH_DEV_MODE=False,
            CLERK_ISSUER=None,
            CLERK_JWKS_URL=None,
        )


def test_production_settings_valid():
    """Verify valid production settings construct cleanly."""
    cfg = Settings(
        APP_ENV="production",
        AUTH_DEV_MODE=False,
        CLERK_ISSUER="https://clerk.decisiontrace.com",
    )
    assert cfg.APP_ENV == "production"
    assert cfg.AUTH_DEV_MODE is False


@pytest.mark.asyncio
async def test_valid_rs256_token_verified(rsa_keypair, monkeypatch):
    """Verify authentic RS256 token signature, issuer, and claims using JWKS."""
    kid = rsa_keypair["kid"]
    monkeypatch.setattr(settings, "AUTH_DEV_MODE", False)
    monkeypatch.setattr(settings, "CLERK_ISSUER", "https://clerk.decisiontrace.com")
    monkeypatch.setattr(settings, "CLERK_AUTHORIZED_PARTIES", "https://app.decisiontrace.com,http://localhost:3000")

    # Seed JWKS cache with test key
    _jwks_cache["keys"] = {kid: rsa_keypair["jwk"]}
    _jwks_cache["expires_at"] = datetime.now(timezone.utc).timestamp() + 3600

    now = datetime.now(timezone.utc)
    token_claims = {
        "sub": "user_2aBcDeFgHiJkLmNo",
        "iss": "https://clerk.decisiontrace.com",
        "azp": "https://app.decisiontrace.com",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=15)).timestamp()),
    }

    signed_jwt = jwt.encode(
        token_claims,
        rsa_keypair["private_pem"],
        algorithm="RS256",
        headers={"kid": kid},
    )

    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=signed_jwt)
    verified = await verify_clerk_token(creds)
    assert verified["sub"] == "user_2aBcDeFgHiJkLmNo"
    assert verified["iss"] == "https://clerk.decisiontrace.com"


@pytest.mark.asyncio
async def test_expired_rs256_token_rejected(rsa_keypair, monkeypatch):
    """Verify expired token returns 401 with expired detail."""
    kid = rsa_keypair["kid"]
    monkeypatch.setattr(settings, "AUTH_DEV_MODE", False)
    monkeypatch.setattr(settings, "CLERK_ISSUER", "https://clerk.decisiontrace.com")

    _jwks_cache["keys"] = {kid: rsa_keypair["jwk"]}
    _jwks_cache["expires_at"] = datetime.now(timezone.utc).timestamp() + 3600

    past = datetime.now(timezone.utc) - timedelta(minutes=10)
    token_claims = {
        "sub": "user_expired_123",
        "iss": "https://clerk.decisiontrace.com",
        "exp": int(past.timestamp()),
    }

    signed_jwt = jwt.encode(
        token_claims,
        rsa_keypair["private_pem"],
        algorithm="RS256",
        headers={"kid": kid},
    )

    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=signed_jwt)
    with pytest.raises(HTTPException) as exc_info:
        await verify_clerk_token(creds)
    assert exc_info.value.status_code == 401
    assert "expired" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_wrong_issuer_token_rejected(rsa_keypair, monkeypatch):
    """Verify mismatched token issuer returns 401."""
    kid = rsa_keypair["kid"]
    monkeypatch.setattr(settings, "AUTH_DEV_MODE", False)
    monkeypatch.setattr(settings, "CLERK_ISSUER", "https://clerk.decisiontrace.com")

    _jwks_cache["keys"] = {kid: rsa_keypair["jwk"]}
    _jwks_cache["expires_at"] = datetime.now(timezone.utc).timestamp() + 3600

    now = datetime.now(timezone.utc)
    token_claims = {
        "sub": "user_hacker_456",
        "iss": "https://fraudulent-issuer.com",
        "exp": int((now + timedelta(minutes=15)).timestamp()),
    }

    signed_jwt = jwt.encode(
        token_claims,
        rsa_keypair["private_pem"],
        algorithm="RS256",
        headers={"kid": kid},
    )

    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=signed_jwt)
    with pytest.raises(HTTPException) as exc_info:
        await verify_clerk_token(creds)
    assert exc_info.value.status_code == 401
    assert "issuer mismatch" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_unauthorized_party_rejected(rsa_keypair, monkeypatch):
    """Verify token with unauthorized azp returns 403."""
    kid = rsa_keypair["kid"]
    monkeypatch.setattr(settings, "AUTH_DEV_MODE", False)
    monkeypatch.setattr(settings, "CLERK_ISSUER", "https://clerk.decisiontrace.com")
    monkeypatch.setattr(settings, "CLERK_AUTHORIZED_PARTIES", "https://app.decisiontrace.com")

    _jwks_cache["keys"] = {kid: rsa_keypair["jwk"]}
    _jwks_cache["expires_at"] = datetime.now(timezone.utc).timestamp() + 3600

    now = datetime.now(timezone.utc)
    token_claims = {
        "sub": "user_party_789",
        "iss": "https://clerk.decisiontrace.com",
        "azp": "https://malicious-site.com",
        "exp": int((now + timedelta(minutes=15)).timestamp()),
    }

    signed_jwt = jwt.encode(
        token_claims,
        rsa_keypair["private_pem"],
        algorithm="RS256",
        headers={"kid": kid},
    )

    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=signed_jwt)
    with pytest.raises(HTTPException) as exc_info:
        await verify_clerk_token(creds)
    assert exc_info.value.status_code == 403
    assert "azp mismatch" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_dev_bypass_fails_when_auth_dev_mode_false(monkeypatch):
    """Verify development token like test_user_xxx fails when AUTH_DEV_MODE=False."""
    monkeypatch.setattr(settings, "AUTH_DEV_MODE", False)

    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="test_user_unauthorized")
    with pytest.raises(HTTPException) as exc_info:
        await verify_clerk_token(creds)
    assert exc_info.value.status_code == 401
