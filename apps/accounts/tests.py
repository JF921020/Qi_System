from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlsplit

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse

from apps.ICmanage.models import ICSetting

from . import google
from .models import PlatformUser
from .testing import GOOGLE_SETTINGS, claims, google_login


@override_settings(**GOOGLE_SETTINGS)
class GoogleLoginTests(TestCase):
    def test_login_page_offers_google_only_and_password_post_is_rejected(self):
        page = self.client.get(reverse("login"), {"next": "/ics/rx/"})
        self.assertContains(page, reverse("accounts:google-start") + "?next=/ics/rx/")
        self.assertNotContains(page, 'name="password"')
        get_user_model().objects.create_user(username="old", password="old-password-123", is_staff=True)
        response = self.client.post(reverse("login"), {"username": "old", "password": "old-password-123"})
        self.assertEqual(response.status_code, 405)
        self.assertNotIn("_auth_user_id", self.client.session)

    def test_start_redirects_to_google_with_state_nonce_and_pkce(self):
        response = self.client.get(reverse("accounts:google-start"))
        target = urlsplit(response["Location"])
        query = parse_qs(target.query)
        self.assertEqual(f"{target.scheme}://{target.netloc}{target.path}", google.AUTH_URL)
        self.assertEqual(query["client_id"], [GOOGLE_SETTINGS["GOOGLE_OAUTH_CLIENT_ID"]])
        self.assertEqual(query["redirect_uri"], ["http://testserver/accounts/google/callback/"])
        self.assertEqual(query["code_challenge_method"], ["S256"])
        flow = self.client.session["google_oauth_flow"]
        self.assertEqual(query["state"], [flow["state"]])
        self.assertEqual(query["nonce"], [flow["nonce"]])
        self.assertNotIn(flow["verifier"], response["Location"])

    def test_first_login_creates_platform_user_and_maps_permissions(self):
        _, response, fetch = google_login(self.client, claims("Alice@Example.com"), "/ics/rx/import/")
        self.assertRedirects(response, "/ics/rx/import/")
        fetch.assert_called_once()
        account = PlatformUser.objects.get()
        self.assertEqual((account.email, account.username, account.google_sub, account.role),
                         ("alice@example.com", "alice", "1001", "admin"))
        self.assertIsNotNone(account.last_login_at)
        self.assertTrue(account.auth_user.is_staff)
        self.assertFalse(account.auth_user.has_usable_password())
        self.assertEqual(int(self.client.session["_auth_user_id"]), account.auth_user_id)
        settings_page = self.client.get(reverse("main:account-settings"))
        self.assertContains(settings_page, f"<dd>{account.id}</dd>", html=True)
        self.assertContains(settings_page, "alice@example.com")

    def test_returning_user_maps_to_same_id_and_follows_email_change(self):
        google_login(self.client, claims())
        first = PlatformUser.objects.get()
        self.client.post(reverse("logout"))
        google_login(self.client, claims("alice.new@example.com"))
        self.assertEqual(PlatformUser.objects.count(), 1)
        account = PlatformUser.objects.get()
        self.assertEqual((account.id, account.email, account.username), (first.id, "alice.new@example.com", "alice"))
        self.assertEqual(account.auth_user.email, "alice.new@example.com")

    def test_username_collision_and_email_owned_by_other_google_account(self):
        google_login(self.client, claims("alice@example.com", "1"))
        self.client.post(reverse("logout"))
        google_login(self.client, claims("alice@other.org", "2"))
        self.assertEqual(PlatformUser.objects.get(google_sub="2").username, "alice-2")
        self.client.post(reverse("logout"))
        _, response, _ = google_login(self.client, claims("alice@example.com", "3"))
        self.assertEqual(response.status_code, 403)
        self.assertContains(response, "已綁定其他 Google 帳號", status_code=403)
        self.assertEqual(PlatformUser.objects.count(), 2)
        self.assertNotIn("_auth_user_id", self.client.session)

    def test_rejects_unverified_email_disallowed_domain_and_inactive_account(self):
        _, response, _ = google_login(self.client, claims(email_verified=False))
        self.assertEqual(response.status_code, 403)
        with self.settings(GOOGLE_ALLOWED_DOMAINS=["company.com"]):
            start, response, _ = google_login(self.client, claims())
            self.assertIn("hd=company.com", start["Location"])
            self.assertEqual(response.status_code, 403)
            _, response, _ = google_login(self.client, claims("bob@company.com", "9"))
            self.assertEqual(response.status_code, 302)
        account = PlatformUser.objects.get()
        self.client.post(reverse("logout"))
        account.is_active = False
        account.save()
        self.assertFalse(get_user_model().objects.get(pk=account.auth_user_id).is_active)
        _, response, _ = google_login(self.client, claims("bob@company.com", "9"))
        self.assertEqual(response.status_code, 403)
        self.assertEqual(PlatformUser.objects.count(), 1)

    def test_state_mismatch_missing_flow_and_cancel_never_call_google(self):
        self.client.get(reverse("accounts:google-start"))
        with patch("apps.accounts.google.fetch_claims") as fetch:
            bad = self.client.get(reverse("accounts:google-callback"), {"state": "forged", "code": "x"})
            replay = self.client.get(reverse("accounts:google-callback"), {"state": "forged", "code": "x"})
            cancelled = self.client.get(reverse("accounts:google-callback"), {"error": "access_denied"})
        for response in (bad, replay, cancelled):
            self.assertEqual(response.status_code, 400)
        fetch.assert_not_called()
        self.assertFalse(PlatformUser.objects.exists())

    def test_unsafe_next_falls_back_to_calculation_page(self):
        _, response, _ = google_login(self.client, claims(), "https://evil.example/")
        self.assertRedirects(response, reverse("main:index"))

    def test_viewer_role_and_role_changes_sync_staff_permission(self):
        with self.settings(GOOGLE_DEFAULT_ROLE="viewer"):
            google_login(self.client, claims())
        import_url = reverse("ICmanage:ic-import", args=["rx"])
        self.assertEqual(self.client.get(import_url).status_code, 403)
        account = PlatformUser.objects.get()
        account.role = PlatformUser.Role.ADMIN
        account.save()
        self.assertEqual(self.client.get(import_url).status_code, 200)

    def test_legacy_account_with_same_email_is_linked_and_superuser_bootstrap(self):
        legacy = get_user_model().objects.create_superuser("boss", "Boss@Example.com", "old-password-123")
        google_login(self.client, claims("boss@example.com", "77"))
        account = PlatformUser.objects.get()
        self.assertEqual(account.auth_user_id, legacy.pk)
        legacy.refresh_from_db()
        self.assertTrue(legacy.is_superuser and legacy.is_staff)
        self.assertFalse(legacy.has_usable_password())
        self.assertEqual(self.client.get(reverse("admin:accounts_platformuser_changelist")).status_code, 200)
        self.client.post(reverse("logout"))
        with self.settings(PLATFORM_SUPERUSER_EMAILS=["root@example.com"]):
            google_login(self.client, claims("root@example.com", "88"))
        self.assertTrue(PlatformUser.objects.get(google_sub="88").auth_user.is_superuser)
        self.client.post(reverse("logout"))
        google_login(self.client, claims("plain@example.com", "99"))
        self.assertEqual(self.client.get(reverse("admin:accounts_platformuser_changelist")).status_code, 403)

    def test_ic_changes_reference_platform_user_id(self):
        google_login(self.client, claims())
        account = PlatformUser.objects.get()
        item = ICSetting.objects.filter(kind="rx").first()
        response = self.client.post(reverse("ICmanage:ic-edit", args=["rx", item.pk]), {
            "name": item.name, "model_number": item.model_number, "voltage": item.voltage or "",
            "mode": "fixed", "axis": item.axis, "efficiency": "80", "points": "", "source": item.source,
        })
        self.assertEqual(response.status_code, 302)
        item.refresh_from_db()
        self.assertEqual(item.updated_by_id, account.id)
        self.assertEqual(list(account.ic_settings.all()), [item])
        self.assertContains(self.client.get(reverse("ICmanage:ic-list", args=["rx"])), "alice")
        account.delete()
        item.refresh_from_db()
        self.assertIsNone(item.updated_by_id)

    def test_admin_login_redirects_to_google_login(self):
        response = self.client.get("/admin/login/", {"next": "/admin/"})
        self.assertRedirects(response, reverse("login") + "?next=%2Fadmin%2F", fetch_redirect_response=False)

    @override_settings(GOOGLE_OAUTH_CLIENT_ID="", GOOGLE_OAUTH_CLIENT_SECRET="")
    def test_unconfigured_client_is_reported(self):
        self.assertContains(self.client.get(reverse("login")), "尚未設定 Google OAuth")
        self.assertEqual(self.client.get(reverse("accounts:google-start")).status_code, 503)


@override_settings(**GOOGLE_SETTINGS)
class FetchClaimsTests(TestCase):
    def call(self, token_response, verified):
        with patch("requests.post", return_value=token_response) as post, \
                patch("google.oauth2.id_token.verify_oauth2_token", return_value=verified) as verify:
            result = google.fetch_claims("code", "http://testserver/cb", "verifier", "nonce-1")
        return result, post, verify

    def test_exchanges_code_with_pkce_and_checks_nonce(self):
        ok = Mock(ok=True, json=lambda: {"id_token": "jwt"})
        result, post, verify = self.call(ok, claims(nonce="nonce-1"))
        self.assertEqual(result["sub"], "1001")
        self.assertEqual(post.call_args.kwargs["data"]["code_verifier"], "verifier")
        self.assertEqual(verify.call_args.args[2], GOOGLE_SETTINGS["GOOGLE_OAUTH_CLIENT_ID"])
        with self.assertRaises(google.GoogleAuthError):
            self.call(ok, claims(nonce="other"))
        with self.assertRaises(google.GoogleAuthError):
            self.call(Mock(ok=False, json=dict), claims(nonce="nonce-1"))
