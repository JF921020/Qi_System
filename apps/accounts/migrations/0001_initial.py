# ruff: noqa: RUF012

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PlatformUser",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("email", models.EmailField(max_length=254, unique=True, verbose_name="信箱")),
                ("username", models.CharField(max_length=150, unique=True, verbose_name="使用者名稱")),
                ("google_sub", models.CharField(editable=False, max_length=255, unique=True, verbose_name="Google 帳號識別碼")),
                ("role", models.CharField(choices=[("admin", "管理者"), ("viewer", "檢視者")], default="admin", max_length=10, verbose_name="角色")),
                ("is_active", models.BooleanField(default=True, verbose_name="啟用")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="建立時間")),
                ("last_login_at", models.DateTimeField(blank=True, editable=False, null=True, verbose_name="最後登入")),
                ("auth_user", models.OneToOneField(editable=False, on_delete=django.db.models.deletion.CASCADE, related_name="platform_user", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "verbose_name": "平台使用者",
                "verbose_name_plural": "平台使用者",
                "db_table": "accounts_platform_user",
                "ordering": ("id",),
            },
        ),
    ]
