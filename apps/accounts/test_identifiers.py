from datetime import datetime, timezone
from unittest.mock import patch

from django.db import IntegrityError
from django.db.models.query import QuerySet
from django.test import SimpleTestCase, TestCase, override_settings

from .identifiers import generate_public_id
from .models import PlatformUser
from .testing import GOOGLE_SETTINGS, claims, google_login


class IdentifierTests(SimpleTestCase):
    def test_verification_time_uses_taiwan_hour_and_four_alphanumeric_characters(self):
        verified = datetime(2026, 10, 20, 5, 59, tzinfo=timezone.utc)
        with patch("apps.accounts.identifiers.secrets.choice", side_effect="A7k2"):
            self.assertEqual(generate_public_id(verified), "26102013A7k2")

    def test_taiwan_date_rollover(self):
        verified = datetime(2026, 12, 31, 16, tzinfo=timezone.utc)
        self.assertRegex(generate_public_id(verified), r"^27010100[A-Za-z0-9]{4}$")


@override_settings(**GOOGLE_SETTINGS)
class IdentifierCollisionTests(TestCase):
    def test_database_collision_retries_after_savepoint_rollback(self):
        google_login(self.client, claims())
        first = PlatformUser.objects.get()
        auth = type(first.auth_user).objects.create_user(username="google_2")
        second = PlatformUser(username="bob", email="bob@example.com", google_sub="2", auth_user=auth)
        # Simulate an ID being claimed between the pre-check and INSERT.
        with patch("apps.accounts.models.generate_public_id", side_effect=[first.public_id, "26102013Z9b1"]), \
                patch.object(QuerySet, "exists", side_effect=[False, True, False]):
            second.save()
        second.refresh_from_db()
        self.assertEqual(second.public_id, "26102013Z9b1")
        self.assertEqual(PlatformUser.objects.count(), 2)

    def test_collision_retries_and_uses_verified_login_time(self):
        verified = datetime(2026, 10, 20, 5, tzinfo=timezone.utc)
        with patch("apps.accounts.services.timezone.now", return_value=verified):
            google_login(self.client, claims())
        first = PlatformUser.objects.get()
        self.assertTrue(first.public_id.startswith("26102013"))
        with patch("apps.accounts.models.generate_public_id", side_effect=[first.public_id.swapcase(), "26102013Z9b1"]) as generate:
            google_login(self.client, claims("bob@example.com", "2"))
        self.assertEqual(generate.call_count, 2)
        self.assertEqual(PlatformUser.objects.get(username="bob").public_id, "26102013Z9b1")

    def test_exhaustion_rolls_back_new_account(self):
        google_login(self.client, claims())
        first = PlatformUser.objects.get()
        with patch("apps.accounts.models.generate_public_id", return_value=first.public_id) as generate, \
                self.assertRaises(IntegrityError):
            google_login(self.client, claims("bob@example.com", "2"))
        self.assertEqual(generate.call_count, 10)
        self.assertEqual(PlatformUser.objects.count(), 1)
        self.assertFalse(type(first.auth_user).objects.filter(email="bob@example.com").exists())
