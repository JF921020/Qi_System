# ruff: noqa: RUF012

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("ICmanage", "0001_move_icsetting"),
        ("main", "0003_alter_icsetting_options"),
    ]
    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[migrations.DeleteModel(name="ICSetting")],
            database_operations=[],
        ),
    ]
