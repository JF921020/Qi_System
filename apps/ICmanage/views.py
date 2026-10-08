import logging
from functools import wraps

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.http import Http404, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_GET, require_http_methods

from .forms import ICImportForm, ICSettingForm
from .importer import read_worksheets
from .models import ICSetting

logger = logging.getLogger(__name__)


def add_save_error(form, error):
    """Only report a duplicate when a conflicting setting actually exists."""
    for item in getattr(form, "settings", [form.instance]):
        conflict = Q(name=item.name)
        if item.voltage is not None:
            conflict |= Q(model_number__iexact=item.model_number, voltage=item.voltage)
        if ICSetting.objects.filter(conflict, kind=item.kind).exclude(pk=item.pk).exists():
            form.add_error(None, f"{item.name}：此類 IC 已有相同名稱或型號／電壓設定，請編輯既有資料；本次不會覆蓋或新增資料。")
            return
    code = error.args[0] if error.args and isinstance(error.args[0], int) else "未知"
    logger.error("IC 儲存失敗，資料庫完整性錯誤代碼：%s", code)
    form.add_error(None, "資料庫無法儲存此設定，並非已確認的型號／電壓重複。請確認資料庫結構與程式版本一致，並完成資料庫遷移後重試。")


def manager_required(view):
    @login_required
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        if not request.user.is_active or not request.user.is_staff:
            raise PermissionDenied("僅管理者可變更 IC 資料。")
        return view(request, *args, **kwargs)
    return wrapped


def kind_title(kind):
    if kind not in ("rx", "charger"):
        raise Http404
    return "Rx IC" if kind == "rx" else "Charger IC"


@require_GET
def ic_home(request):
    return redirect("rx/")


@require_GET
def ic_list(request, kind):
    title = kind_title(kind)
    items = ICSetting.objects.filter(kind=kind)
    query = request.GET.get("q", "").strip()[:120]
    # Keep the full list available so clearing a live search restores every row.
    return render(request, "ICmanage/ic_list.html", {"kind": kind, "title": title, "items": items, "query": query})


@manager_required
@require_http_methods(["GET", "POST"])
def ic_import(request, kind):
    title = kind_title(kind)
    if request.method == "POST" and request.POST.get("action") == "worksheets":
        upload = request.FILES.get("file")
        if not upload:
            return JsonResponse({"error": "請選擇 XLSX 檔案。"}, status=400)
        try:
            return JsonResponse({"worksheets": read_worksheets(upload)})
        except ValueError as error:
            return JsonResponse({"error": str(error)}, status=400)
    form = ICImportForm(request.POST if request.method == "POST" else None,
                        request.FILES if request.method == "POST" else None,
                        instance=ICSetting(kind=kind))
    if request.method == "POST" and form.is_valid():
        try:
            saved = form.save()
            result = form.result
            messages.success(request, f'已依 {result["voltage_source"]} 匯入 {len(saved)} 筆 IC 設定：'
                             f'完整儲存 {result["count"]} 點，略過 {result["skipped"]} 筆空白效率。'
                             '計算頁重新載入後即可選用。')
            if result["skipped_voltages"]:
                messages.warning(request, '以下電壓效率全部空白，未建立設定：' +
                                 '、'.join(f'{value:g}V' for value in result["skipped_voltages"]))
            return redirect("../")
        except IntegrityError as error:
            add_save_error(form, error)
    return render(request, "ICmanage/ic_import.html", {"kind": kind, "title": title, "form": form})


@manager_required
@require_http_methods(["GET", "POST"])
def ic_edit(request, kind, pk):
    title = kind_title(kind)
    item = get_object_or_404(ICSetting, pk=pk, kind=kind)
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
                    # Relative locations preserve the proxy mount without double-prefixing.
                    return redirect("../../")
        except IntegrityError as error:
            add_save_error(form, error)
    return render(request, "ICmanage/ic_form.html", {"kind": kind, "title": title, "form": form, "item": item})


@manager_required
@require_http_methods(["GET", "POST"])
def ic_delete(request, kind, pk):
    title = kind_title(kind)
    item = get_object_or_404(ICSetting, pk=pk, kind=kind)
    if request.method == "POST":
        item.delete()
        messages.success(request, "IC 設定已刪除。")
        return redirect("../../")
    return render(request, "ICmanage/ic_delete.html", {"kind": kind, "title": title, "item": item})
