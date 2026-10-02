# ruff: noqa: RUF012

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("ICmanage", "0003_icsetting_created_at")]

    operations = [
        migrations.RemoveField(model_name="icsetting", name="created_at"),
    ]
