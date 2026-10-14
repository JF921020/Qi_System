# ruff: noqa: RUF012

from django.db import migrations, models


def copy_references(apps, schema_editor):
    database = schema_editor.connection.alias
    accounts = apps.get_model("accounts", "PlatformUser").objects.using(database)
    items = apps.get_model("ICmanage", "ICSetting").objects.using(database)
    for pk, public_id in accounts.values_list("pk", "public_id").iterator():
        items.filter(updated_by_id=pk).update(updated_by_public_id_id=public_id)


def restore_references(apps, schema_editor):
    database = schema_editor.connection.alias
    accounts = apps.get_model("accounts", "PlatformUser").objects.using(database)
    items = apps.get_model("ICmanage", "ICSetting").objects.using(database)
    for pk, public_id in accounts.values_list("pk", "public_id").iterator():
        items.filter(updated_by_public_id_id=public_id).update(updated_by_id=pk)


class Migration(migrations.Migration):
    dependencies = [
        ("ICmanage", "0008_icsetting_updated_by"),
        ("accounts", "0003_replace_legacy_public_ids"),
    ]

    operations = [
        migrations.AddField(
            model_name="icsetting",
            name="updated_by_public_id",
            field=models.ForeignKey(
                "accounts.PlatformUser", to_field="public_id", verbose_name="最後修改者",
                null=True, blank=True, editable=False, on_delete=models.SET_NULL, related_name="+",
            ),
        ),
        migrations.RunPython(copy_references, restore_references),
        migrations.RemoveField(model_name="icsetting", name="updated_by"),
        migrations.RenameField(model_name="icsetting", old_name="updated_by_public_id", new_name="updated_by"),
        migrations.AlterField(
            model_name="icsetting",
            name="updated_by",
            field=models.ForeignKey(
                "accounts.PlatformUser", to_field="public_id", verbose_name="最後修改者",
                null=True, blank=True, editable=False, on_delete=models.SET_NULL, related_name="ic_settings",
            ),
        ),
    ]
