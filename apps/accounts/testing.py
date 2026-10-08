"""Test helpers that drive the Google sign-in flow without contacting Google."""

from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from django.urls import reverse

GOOGLE_SETTINGS = {"GOOGLE_OAUTH_CLIENT_ID": "test-client.apps.googleusercontent.com",
                   "GOOGLE_OAUTH_CLIENT_SECRET": "test-secret"}


def claims(email="alice@example.com", sub="1001", **extra):
    return {"sub": sub, "email": email, "email_verified": True, **extra}


def google_login(client, verified_claims, next_url=None, start_path=None, callback_path=None):
    """Run start -> callback with fetch_claims mocked; returns (start_response, callback_response, mock)."""
    start = client.get(start_path or reverse("accounts:google-start"), {"next": next_url} if next_url else {})
    query = parse_qs(urlsplit(start["Location"]).query)
    with patch("apps.accounts.google.fetch_claims", return_value=verified_claims) as fetch:
        callback = client.get(callback_path or reverse("accounts:google-callback"),
                              {"state": query["state"][0], "code": "auth-code"})
    return start, callback, fetch
