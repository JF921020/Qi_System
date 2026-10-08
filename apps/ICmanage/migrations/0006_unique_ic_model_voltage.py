# ruff: noqa: RUF012

import math
import re

from django.db import migrations, models


def backfill_named_voltages(apps, schema_editor):
    settings = apps.get_model("ICmanage", "ICSetting").objects.using(schema_editor.connection.alias)
    pending, seen = [], set()
    for item in settings.all():
        voltage = item.voltage
        if voltage is None:
            match = re.fullmatch(re.escape(item.model_number) + r"_(\d+(?:\.\d+)?)V", item.name, re.IGNORECASE)
            if match:
                candidate = float(match[1])
                if math.isfinite(candidate) and 0.000001 <= candidate <= 1000000:
                    voltage = candidate
                    pending.append((item.pk, voltage))
        if voltage is not None:
            key = (item.kind, item.model_number.strip().casefold(), voltage)
            if key in seen:
                raise RuntimeError("存在重複 IC 型號／電壓，請先整理重複設定後重新執行 migration；未自動刪除資料。")
            seen.add(key)
    for pk, voltage in pending:
        settings.filter(pk=pk).update(voltage=voltage)


class Migration(migrations.Migration):
    dependencies = [("ICmanage", "0005_icsetting_voltage")]

    operations = [
        migrations.RunPython(backfill_named_voltages, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="icsetting",
            constraint=models.UniqueConstraint(fields=("kind", "model_number", "voltage"), name="unique_ic_model_voltage"),
        ),
    ]
