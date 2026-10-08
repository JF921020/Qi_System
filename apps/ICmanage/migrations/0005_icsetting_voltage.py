# ruff: noqa: RUF012

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("ICmanage", "0004_remove_icsetting_created_at")]

    operations = [
        migrations.AddField(
            model_name="icsetting", name="voltage",
            field=models.FloatField(blank=True, null=True, verbose_name="工作電壓 (V)"),
        ),
    ]
