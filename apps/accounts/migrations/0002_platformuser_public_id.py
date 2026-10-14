# ruff: noqa: RUF012

from django.db import migrations, models

from apps.accounts.identifiers import generate_public_id


def assign_public_ids(apps, schema_editor):
    accounts = apps.get_model("accounts", "PlatformUser").objects.using(schema_editor.connection.alias)
    for account in accounts.filter(public_id__isnull=True).iterator():
        # Creation time is the closest available record of the first verified login.
        for _ in range(10):
            public_id = generate_public_id(account.created_at)
            if not accounts.filter(public_id__iexact=public_id).exists():
                accounts.filter(pk=account.pk).update(public_id=public_id)
                break
        else:
            raise RuntimeError("Unable to allocate a unique platform user ID after 10 attempts.")


class Migration(migrations.Migration):
    dependencies = [("accounts", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="platformuser",
            name="public_id",
            field=models.CharField("平台使用者 ID", max_length=187, null=True, editable=False),
        ),
        migrations.RunPython(assign_public_ids, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="platformuser",
            name="public_id",
            field=models.CharField("平台使用者 ID", max_length=187, unique=True, editable=False),
        ),
    ]
