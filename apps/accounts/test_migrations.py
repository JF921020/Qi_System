from datetime import datetime, timezone
from importlib import import_module
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase

from apps.ICmanage.models import ICSetting


class PublicIdMigrationTests(TransactionTestCase):
    def test_legacy_ids_are_replaced_once_and_ic_reference_is_preserved(self):
        executor = MigrationExecutor(connection)
        latest = executor.loader.graph.leaf_nodes()
        old_target = [("accounts", "0002_platformuser_public_id"), ("ICmanage", "0008_icsetting_updated_by")]
        migration = import_module("apps.accounts.migrations.0003_replace_legacy_public_ids")
        try:
            executor.migrate(old_target)
            old_apps = executor.loader.project_state(old_target).apps
            User = old_apps.get_model("auth", "User")
            Account = old_apps.get_model("accounts", "PlatformUser")
            rows = []
            for index, public_id in enumerate((
                "alice-550e8400-e29b-41d4-a716-446655440000",
                "bob-017f22e2-79b0-7cc3-98c4-dc0c0c07398f",
                "26102013A7k2",
            )):
                auth = User.objects.create(username=f"google_{index}")
                account = Account.objects.create(
                    username=f"user{index}", email=f"{index}@example.com", google_sub=str(index),
                    auth_user_id=auth.pk, public_id=public_id,
                )
                Account.objects.filter(pk=account.pk).update(
                    created_at=datetime(2026, 10, 20, 5, tzinfo=timezone.utc),
                )
                rows.append(account)
            OldICSetting = old_apps.get_model("ICmanage", "ICSetting")
            item = OldICSetting.objects.create(kind="rx", name="migration-test", model_number="migration-test",
                                               updated_by_id=rows[0].pk)
            unowned = OldICSetting.objects.create(kind="rx", name="unowned", model_number="unowned")
            executor = MigrationExecutor(connection)
            with patch.object(migration, "generate_public_id", side_effect=[
                "26102013A7k2", "26102013Z9b1", "26102013Q3c2",
            ]) as generate:
                executor.migrate(latest)
            self.assertEqual(generate.call_count, 3)
            for account, expected in zip(rows, ("26102013Z9b1", "26102013Q3c2", "26102013A7k2")):
                updated = Account.objects.get(pk=account.pk)
                self.assertEqual(updated.public_id, expected)
                self.assertEqual(updated.auth_user_id, account.auth_user_id)
                self.assertEqual(updated.username, account.username)
            item = ICSetting.objects.get(pk=item.pk)
            self.assertEqual(item.updated_by_id, "26102013Z9b1")
            self.assertEqual(item.updated_by.pk, rows[0].pk)
            self.assertIsNone(ICSetting.objects.get(pk=unowned.pk).updated_by_id)
            with connection.schema_editor() as editor, patch.object(migration, "generate_public_id") as generate:
                migration.replace_legacy_public_ids(old_apps, editor)
            generate.assert_not_called()
            rollback_target = [("accounts", "0003_replace_legacy_public_ids"),
                               ("ICmanage", "0008_icsetting_updated_by")]
            executor = MigrationExecutor(connection)
            executor.migrate(rollback_target)
            RolledBackIC = executor.loader.project_state(rollback_target).apps.get_model("ICmanage", "ICSetting")
            self.assertEqual(RolledBackIC.objects.get(pk=item.pk).updated_by_id, rows[0].pk)
            self.assertIsNone(RolledBackIC.objects.get(pk=unowned.pk).updated_by_id)
        finally:
            MigrationExecutor(connection).migrate(latest)

    def test_existing_accounts_receive_unique_ids_without_changing_references(self):
        executor = MigrationExecutor(connection)
        latest = executor.loader.graph.leaf_nodes()
        old_target = [("accounts", "0001_initial")]
        try:
            executor.migrate(old_target)
            old_apps = executor.loader.project_state(old_target).apps
            User = old_apps.get_model("auth", "User")
            Account = old_apps.get_model("accounts", "PlatformUser")
            originals = []
            for number, name in enumerate(("alice", "a" * 150), start=1):
                auth = User.objects.create(username=f"google_{number}")
                account = Account.objects.create(
                    username=name, email=f"{number}@example.com",
                    google_sub=str(number), auth_user_id=auth.pk,
                )
                originals.append((account.pk, name, auth.pk))
        finally:
            executor = MigrationExecutor(connection)
            executor.migrate(latest)

        Account = executor.loader.project_state(latest).apps.get_model("accounts", "PlatformUser")
        identifiers = set()
        for pk, name, auth_pk in originals:
            account = Account.objects.get(pk=pk)
            self.assertEqual(account.auth_user_id, auth_pk)
            self.assertEqual(account.username, name)
            self.assertRegex(account.public_id, r"^[0-9]{8}[A-Za-z0-9]{4}$")
            self.assertEqual(account.public_id[:8], account.created_at.astimezone(ZoneInfo("Asia/Taipei")).strftime("%y%m%d%H"))
            identifiers.add(account.public_id)
        self.assertEqual(len(identifiers), len(originals))
