"""Security, token hashing, and Clerk JWT verification."""

import hashlib
import secrets
import time
from typing import Any

import httpx
import jwt
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings

# In-memory JWKS cache
_jwks_cache: dict[str, Any] = {"keys": {}, "expires_at": 0}
security_bearer = HTTPBearer(auto_error=False)


def generate_webhook_token() -> str:
    """Generate high-entropy token for Omi installation."""
    return f"omi_{secrets.token_urlsafe(32)}"


def hash_webhook_token(token: str) -> str:
    """Hash token using SHA-256 for secure database storage."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def get_clerk_jwks(force_refresh: bool = False) -> dict[str, Any]:
    """Fetch and cache JWKS from Clerk, supporting forced refresh on cache misses."""
    now = time.time()
    if not force_refresh and _jwks_cache["keys"] and _jwks_cache["expires_at"] > now:
        return _jwks_cache["keys"]

    jwks_url = settings.CLERK_JWKS_URL
    if not jwks_url and settings.CLERK_ISSUER:
        jwks_url = f"{settings.CLERK_ISSUER.rstrip('/')}/.well-known/jwks.json"

    if not jwks_url:
        return {}

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(jwks_url)
            if resp.status_code == 200:
                data = resp.json()
                keys_by_kid = {key["kid"]: key for key in data.get("keys", [])}
                _jwks_cache["keys"] = keys_by_kid
                _jwks_cache["expires_at"] = now + 3600  # cache 1 hour
                return keys_by_kid
    except Exception:
        pass
    return _jwks_cache["keys"]


async def verify_clerk_token(
    credentials: HTTPAuthorizationCredentials | None = Security(security_bearer),
) -> dict[str, Any]:
    """Verify Clerk session JWT token and extract claims."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    # Development or Mock token support
    if settings.AUTH_DEV_MODE:
        if token.startswith("test_user_") or token.startswith("user_"):
            return {
                "sub": token,
                "clerk_id": token,
                "email": f"{token}@decisiontrace.local",
            }

    try:
        unverified_header = jwt.get_unverified_header(token)
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    kid = unverified_header.get("kid")
    jwks = await get_clerk_jwks()

    if not (jwks and kid in jwks):
        # Force refresh once in case key rotated or cache was empty
        jwks = await get_clerk_jwks(force_refresh=True)

    if jwks and kid in jwks:
        jwk = jwks[kid]
        public_key = jwt.algorithms.RSAAlgorithm.from_jwk(jwk)
    else:
        # If no JWKS URL configured or kid not found in dev/test environment
        if settings.AUTH_DEV_MODE:
            try:
                claims = jwt.decode(token, options={"verify_signature": False})
                return claims
            except Exception:
                pass
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unable to verify token signature: public key not available",
            headers={"WWW-Authenticate": "Bearer"},
        )

    decode_kwargs: dict[str, Any] = {
        "algorithms": ["RS256"],
        "options": {"verify_aud": bool(settings.CLERK_AUDIENCE)},
    }
    if settings.CLERK_ISSUER:
        iss = settings.CLERK_ISSUER.rstrip("/")
        decode_kwargs["issuer"] = [iss, f"{iss}/"]
    if settings.CLERK_AUDIENCE:
        decode_kwargs["audience"] = settings.CLERK_AUDIENCE

    try:
        payload = jwt.decode(token, public_key, **decode_kwargs)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token signature has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidIssuerError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token issuer mismatch",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid session token: {e!s}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session token missing user subject (sub) claim",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check authorized parties (azp) if configured
    azp_list = settings.authorized_parties_list
    if azp_list:
        azp = payload.get("azp")
        if not azp or azp not in azp_list:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unauthorized token party (azp mismatch)",
            )

    return payload
