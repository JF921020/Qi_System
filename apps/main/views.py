import json
from pathlib import Path

from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_POST

from apps.ICmanage.catalog import database_catalog

from .service import calculate


def index(request):
    curves, settings = database_catalog()
    scripts = (Path(__file__).parent / "static/main").glob("qi-tool-*.js")
    return render(request, "main/index.html", {
        "curves": curves, "ic_settings": settings,
        "script_version": max(script.stat().st_mtime_ns for script in scripts),
    })


@require_POST
def main_api(request):
    if request.content_type != "application/json":
        return JsonResponse({"error": "請使用 application/json"}, status=415)
    try:
        result = calculate(json.loads(request.body), database_catalog()[0])
    except (ValueError, UnicodeDecodeError) as error:
        return JsonResponse({"error": str(error)}, status=400)
    return JsonResponse(result, json_dumps_params={"allow_nan": False})
