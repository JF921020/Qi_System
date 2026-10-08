"""Minimal Google OpenID Connect client: authorization code flow with state, nonce and PKCE."""

import base64
import hashlib
import hmac
from secrets import token_urlsafe
from urllib.parse import urlencode

from django.conf import settings

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"


class GoogleAuthError(Exception):
    """Sign-in failed; the message is safe to show to the user."""


def is_configured():
    return bool(settings.GOOGLE_OAUTH_CLIENT_ID and settings.GOOGLE_OAUTH_CLIENT_SECRET)


def new_flow():
    verifier = token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    return {"state": token_urlsafe(32), "nonce": token_urlsafe(32), "verifier": verifier, "challenge": challenge}


def authorization_url(flow, redirect_uri):
    params = {
        "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": flow["state"],
        "nonce": flow["nonce"],
        "code_challenge": flow["challenge"],
        "code_challenge_method": "S256",
        "prompt": "select_account",
    }
    if len(settings.GOOGLE_ALLOWED_DOMAINS) == 1:
        params["hd"] = settings.GOOGLE_ALLOWED_DOMAINS[0]  # UI hint only; the server still checks the claim.
    return f"{AUTH_URL}?{urlencode(params)}"


def fetch_claims(code, redirect_uri, verifier, nonce):
    """Exchange the code with Google and return verified ID token claims."""
    import requests  # optional until Google login is used
    from google.auth.transport.requests import Request
    from google.oauth2 import id_token

    try:
        response = requests.post(TOKEN_URL, timeout=10, data={
            "code": code,
            "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
            "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
            "code_verifier": verifier,
        })
    except requests.RequestException as error:
        raise GoogleAuthError("無法連線至 Google，請稍後再試。") from error
    token = response.json().get("id_token") if response.ok else None
    if not token:
        raise GoogleAuthError("Google 未核發登入憑證，請重新登入。")
    try:
        claims = id_token.verify_oauth2_token(token, Request(), settings.GOOGLE_OAUTH_CLIENT_ID,
                                              clock_skew_in_seconds=10)
    except ValueError as error:
        raise GoogleAuthError("Google 登入憑證驗證失敗，請重新登入。") from error
    if not hmac.compare_digest(str(claims.get("nonce", "")), nonce):
        raise GoogleAuthError("登入憑證與本次請求不符，請重新登入。")
    return claims
