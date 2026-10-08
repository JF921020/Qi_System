import hmac
from urllib.parse import urlencode

from django.conf import settings
from django.contrib import messages
from django.contrib.auth import login
from django.shortcuts import redirect, render, resolve_url
from django.urls import reverse
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.http import require_GET

from . import google
from .services import resolve_google_user

FLOW_KEY = "google_oauth_flow"


def safe_next(request, url):
    if url and url_has_allowed_host_and_scheme(url, allowed_hosts={request.get_host()},
                                               require_https=request.is_secure()):
        return url
    return resolve_url(settings.LOGIN_REDIRECT_URL)


def callback_uri(request):
    return settings.GOOGLE_OAUTH_REDIRECT_URI or request.build_absolute_uri(reverse("accounts:google-callback"))


def login_page(request, error=None, status=200):
    return render(request, "registration/login.html", {
        "title": "登入", "next": request.GET.get("next", ""), "configured": google.is_configured(), "error": error,
    }, status=status)


@require_GET
def login_view(request):
    return login_page(request)


@require_GET
def admin_login_redirect(request):
    return redirect(f"{reverse('login')}?{urlencode({'next': request.GET.get('next', reverse('admin:index'))})}")


@require_GET
def google_start(request):
    if not google.is_configured():
        return login_page(request, "尚未設定 Google OAuth 用戶端，請聯絡系統管理者。", 503)
    flow = google.new_flow()
    request.session[FLOW_KEY] = {**flow, "next": safe_next(request, request.GET.get("next"))}
    return redirect(google.authorization_url(flow, callback_uri(request)))


@require_GET
def google_callback(request):
    flow = request.session.pop(FLOW_KEY, None)
    if request.GET.get("error"):
        return login_page(request, "已取消 Google 登入。", 400)
    if not flow or not hmac.compare_digest(request.GET.get("state", ""), flow["state"]) or not request.GET.get("code"):
        return login_page(request, "登入請求已失效，請重新登入。", 400)
    try:
        claims = google.fetch_claims(request.GET["code"], callback_uri(request), flow["verifier"], flow["nonce"])
        account, created = resolve_google_user(claims)
    except google.GoogleAuthError as error:
        return login_page(request, str(error), 403)
    login(request, account.auth_user, backend="django.contrib.auth.backends.ModelBackend")
    messages.success(request, f"{'已建立平台帳號並' if created else '已'}以 {account.email} 登入（ID {account.id}）。")
    return redirect(flow["next"])
