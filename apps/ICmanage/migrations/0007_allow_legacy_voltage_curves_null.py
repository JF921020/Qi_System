# ruff: noqa: RUF012

from django.db import migrations, models


def allow_legacy_null(apps, schema_editor):
    """Retain curves from a reverted version without requiring new writes to it."""
    model = apps.get_model("ICmanage", "ICSetting")
    connection = schema_editor.connection
    with connection.cursor() as cursor:
        columns = connection.introspection.get_table_description(cursor, model._meta.db_table)
    legacy = next((column for column in columns if column.name == "voltage_curves"), None)
    if legacy is None or legacy.null_ok:
        return
    # This orphan column exists only in the older MySQL deployment. Never drop it:
    # it can still contain measurement data even though it is absent from state.
    if connection.vendor != "mysql":
        raise RuntimeError("偵測到舊 voltage_curves 必填欄位；此相容遷移僅支援 MySQL，請保留資料並人工檢查。")
    old = models.JSONField()
    new = models.JSONField(null=True)
    for field in (old, new):
        field.set_attributes_from_name("voltage_curves")
        field.model = model
    schema_editor.alter_field(model, old, new)


class Migration(migrations.Migration):
    dependencies = [("ICmanage", "0006_unique_ic_model_voltage")]

    operations = [
        migrations.RunPython(allow_legacy_null, migrations.RunPython.noop, atomic=False),
    ]
