import json
from pathlib import Path

from django.contrib import messages
from django.contrib.admin.views.decorators import staff_member_required
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.http import Http404, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from .catalog import database_catalog
from .forms import ICSettingForm
from .models import ICSetting
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


def kind_title(kind):
    if kind not in ("rx", "charger"):
        raise Http404
    return "Rx IC" if kind == "rx" else "Charger IC"


@require_GET
def ic_list(request, kind):
    title = kind_title(kind)
    items = ICSetting.objects.filter(kind=kind)
    query = request.GET.get("q", "").strip()[:120]
    if query:
        items = items.filter(Q(name__icontains=query) | Q(model_number__icontains=query))
    return render(request, "main/ic_list.html", {"kind": kind, "title": title, "items": items, "query": query})


@staff_member_required
@require_http_methods(["GET", "POST"])
def ic_edit(request, kind, pk=None):
    title = kind_title(kind)
    item = get_object_or_404(ICSetting, pk=pk, kind=kind) if pk else ICSetting(kind=kind)
    form = ICSettingForm(request.POST if request.method == "POST" else None, instance=item)
    if request.method == "POST" and form.is_valid():
        try:
            with transaction.atomic():
                saved = form.save(commit=False)
                if ICSetting.objects.filter(kind=kind, name=saved.name).exclude(pk=saved.pk).exists():
                    form.add_error("name", "此類 IC 已有同名設定，請使用其他名稱。")
                else:
                    saved.save()
                    messages.success(request, "IC 設定已儲存；計算頁重新載入後即可選用。")
                    return redirect("main:ic-list", kind=kind)
        except IntegrityError:
            form.add_error("name", "此類 IC 已有同名設定，請使用其他名稱。")
    return render(request, "main/ic_form.html", {"kind": kind, "title": title, "form": form, "item": item})


@staff_member_required
@require_http_methods(["GET", "POST"])
def ic_delete(request, kind, pk):
    title = kind_title(kind)
    item = get_object_or_404(ICSetting, pk=pk, kind=kind)
    if request.method == "POST":
        item.delete()
        messages.success(request, "IC 設定已刪除。")
        return redirect("main:ic-list", kind=kind)
    return render(request, "main/ic_delete.html", {"kind": kind, "title": title, "item": item})
