import json
from pathlib import Path

from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_POST

from .service import CURVES, calculate

def index(request):
    script = Path(__file__).parent / "static/calculator/qi-tool.js"
    return render(request, "calculator/index.html", {
        "curves": CURVES, "script_version": script.stat().st_mtime_ns,
    })


@require_POST
def calculate_api(request):
    if request.content_type != "application/json":
        return JsonResponse({"error": "請使用 application/json"}, status=415)
    try:
        result = calculate(json.loads(request.body))
    except (ValueError, UnicodeDecodeError) as error:
        return JsonResponse({"error": str(error)}, status=400)
    return JsonResponse(result, json_dumps_params={"allow_nan": False})
