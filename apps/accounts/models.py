from django.conf import settings
from django.db import IntegrityError, models, router, transaction
from django.utils import timezone

from .identifiers import generate_public_id


class PlatformUser(models.Model):
    """Platform identity created from Google sign-in; other data references this ID."""

    class Role(models.TextChoices):
        ADMIN = "admin", "管理者"
        VIEWER = "viewer", "檢視者"

    email = models.EmailField("信箱", unique=True)
    username = models.CharField("使用者名稱", max_length=150, unique=True)
    public_id = models.CharField("平台使用者 ID", max_length=187, unique=True, editable=False)
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
        if self._state.adding and not self.public_id:
            verified_at = self.last_login_at or timezone.now()
            database = kwargs.get("using") or router.db_for_write(type(self), instance=self)
            accounts = type(self).objects.using(database)
            for _ in range(10):
                self.public_id = generate_public_id(verified_at)
                if accounts.filter(public_id__iexact=self.public_id).exists():
                    continue
                try:
                    # A savepoint keeps the login transaction usable after a collision.
                    with transaction.atomic(using=database):
                        super().save(*args, **kwargs)
                    break
                except IntegrityError:
                    if not accounts.filter(public_id__iexact=self.public_id).exists():
                        raise
            else:
                raise IntegrityError("Unable to allocate a unique platform user ID after 10 attempts.")
        else:
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
