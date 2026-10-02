# ruff: noqa: RUF012

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("ICmanage", "0002_icsetting_ma_axis")]

    operations = [
        # Historical import times were not recorded. Leave them unknown.
        migrations.AddField(
            model_name="icsetting",
            name="created_at",
            field=models.DateTimeField("新增時間", null=True, editable=False),
        ),
        migrations.AlterField(
            model_name="icsetting",
            name="created_at",
            field=models.DateTimeField("新增時間", auto_now_add=True, null=True),
        ),
    ]
