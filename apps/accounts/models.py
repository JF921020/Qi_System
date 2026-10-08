from django.conf import settings
from django.db import models


class PlatformUser(models.Model):
    """Platform identity created from Google sign-in; other data references this ID."""

    class Role(models.TextChoices):
        ADMIN = "admin", "管理者"
        VIEWER = "viewer", "檢視者"

    email = models.EmailField("信箱", unique=True)
    username = models.CharField("使用者名稱", max_length=150, unique=True)
    google_sub = models.CharField("Google 帳號識別碼", max_length=255, unique=True, editable=False)
    role = models.CharField("角色", max_length=10, choices=Role.choices, default=Role.ADMIN)
    is_active = models.BooleanField("啟用", default=True)
    # Django session/admin still require auth.User; it is an internal mapping only, never logged in by password.
    auth_user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                     related_name="platform_user", editable=False)
    created_at = models.DateTimeField("建立時間", auto_now_add=True)
    last_login_at = models.DateTimeField("最後登入", null=True, blank=True, editable=False)

    class Meta:
        db_table = "accounts_platform_user"
        ordering = ("id",)
        verbose_name = verbose_name_plural = "平台使用者"

    def __str__(self):
        return f"{self.username} <{self.email}>"

    @property
    def is_admin(self):
        return self.is_active and self.role == self.Role.ADMIN

    def save(self, *args, **kwargs):
        self.email = self.email.strip().lower()
        super().save(*args, **kwargs)
        self.sync_auth_user()

    def sync_auth_user(self):
        """Mirror platform role onto the internal Django account used by permission checks."""
        type(self.auth_user).objects.filter(pk=self.auth_user_id).update(
            is_active=self.is_active, is_staff=self.is_admin, email=self.email,
        )
        self.auth_user.is_active, self.auth_user.is_staff, self.auth_user.email = (
            self.is_active, self.is_admin, self.email)


def platform_user_of(user):
    """Return the PlatformUser for request.user, or None for guests and legacy accounts."""
    return getattr(user, "platform_user", None) if getattr(user, "is_authenticated", False) else None
