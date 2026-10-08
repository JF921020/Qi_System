import re

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from .google import GoogleAuthError
from .models import PlatformUser


def unique_username(email):
    base = re.sub(r"[^\w.+-]", "", email.split("@")[0])[:140] or "user"
    name, suffix = base, 1
    while PlatformUser.objects.filter(username__iexact=name).exists():
        suffix += 1
        name = f"{base}-{suffix}"
    return name


def internal_auth_user(email, sub):
    """Reuse one legacy Django account with the same email, otherwise create a password-less one."""
    User = get_user_model()
    legacy = list(User.objects.filter(email__iexact=email, platform_user__isnull=True)[:2])
    if len(legacy) == 1:
        user = legacy[0]
        user.set_unusable_password()
        user.save(update_fields=["password"])
        return user
    user = User(username=f"google_{sub}"[:150], email=email)
    user.set_unusable_password()
    user.save()
    return user


@transaction.atomic
def resolve_google_user(claims):
    """Create or map the platform user for verified Google claims; returns (PlatformUser, created)."""
    sub = str(claims.get("sub") or "")
    email = str(claims.get("email") or "").strip().lower()
    if not sub or not email or claims.get("email_verified") is not True:
        raise GoogleAuthError("此 Google 帳號的信箱尚未驗證，無法登入。")
    domains = settings.GOOGLE_ALLOWED_DOMAINS
    if domains and email.rsplit("@", 1)[-1] not in domains:
        raise GoogleAuthError("此信箱網域未獲准使用本平台。")

    account = PlatformUser.objects.select_for_update().filter(google_sub=sub).first()
    created = account is None
    if created:
        if PlatformUser.objects.filter(email=email).exists():
            raise GoogleAuthError("此信箱已綁定其他 Google 帳號，請聯絡系統管理者。")
        account = PlatformUser(google_sub=sub, email=email, username=unique_username(email),
                               role=settings.GOOGLE_DEFAULT_ROLE, auth_user=internal_auth_user(email, sub))
    elif account.email != email and not PlatformUser.objects.filter(email=email).exists():
        account.email = email  # Google sub is the stable key; keep the latest verified email.
    if not account.is_active:
        raise GoogleAuthError("此帳號已停用，請聯絡系統管理者。")
    account.last_login_at = timezone.now()
    account.save()
    if email in settings.PLATFORM_SUPERUSER_EMAILS and not account.auth_user.is_superuser:
        account.auth_user.is_superuser = True
        account.auth_user.save(update_fields=["is_superuser"])
    return account, created
