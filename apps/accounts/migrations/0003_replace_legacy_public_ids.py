# ruff: noqa: RUF012

import re

from django.db import IntegrityError, migrations, transaction

from apps.accounts.identifiers import generate_public_id


def replace_legacy_public_ids(apps, schema_editor):
    database = schema_editor.connection.alias
    accounts = apps.get_model("accounts", "PlatformUser").objects.using(database)
    for account in accounts.all().iterator():
        if re.fullmatch(r"[0-9]{8}[A-Za-z0-9]{4}", account.public_id or ""):
            continue
        for _ in range(10):
            public_id = generate_public_id(account.created_at)
            if accounts.filter(public_id__iexact=public_id).exists():
                continue
            try:
                with transaction.atomic(using=database):
                    accounts.filter(pk=account.pk).update(public_id=public_id)
                break
            except IntegrityError:
                if not accounts.filter(public_id__iexact=public_id).exists():
                    raise
        else:
            raise RuntimeError("Unable to replace legacy platform user ID after 10 attempts.")


class Migration(migrations.Migration):
    dependencies = [("accounts", "0002_platformuser_public_id")]

    # Rolling back the migration keeps the new IDs; old IDs cannot be reconstructed.
    operations = [migrations.RunPython(replace_legacy_public_ids, migrations.RunPython.noop, atomic=True)]
