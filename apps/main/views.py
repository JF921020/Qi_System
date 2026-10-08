from pathlib import Path

from django.shortcuts import render
from django.views.decorators.http import require_GET

from apps.ICmanage.catalog import database_catalog


@require_GET
def account_settings(request):
    return render(request, "main/account_settings.html", {"title": "帳號設定"})


def index(request):
    curves, settings = database_catalog()
    scripts = (Path(__file__).parent / "static/main").glob("qi-tool-*.js")
    return render(request, "main/index.html", {
        "curves": curves, "ic_settings": settings,
        "script_version": max(script.stat().st_mtime_ns for script in scripts),
    })
