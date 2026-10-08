# ruff: noqa: RUF012

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("ICmanage", "0007_allow_legacy_voltage_curves_null"),
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="icsetting",
            name="updated_by",
            field=models.ForeignKey(blank=True, editable=False, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="ic_settings", to="accounts.platformuser", verbose_name="最後修改者"),
        ),
    ]
