# ruff: noqa: RUF012

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("ICmanage", "0001_move_icsetting")]

    operations = [
        migrations.AlterField(
            model_name="icsetting",
            name="axis",
            field=models.CharField(
                "查表軸向", max_length=7, default="current",
                choices=[("power", "輸出功率 (W)"), ("current", "充電電流 (A)"), ("ma", "充電電流 (mA)")],
            ),
        ),
    ]
