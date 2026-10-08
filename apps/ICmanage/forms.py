import re
from pathlib import Path
from typing import ClassVar

from django import forms
from django.core.exceptions import ValidationError
from django.db import transaction

from .importer import read_curve
from .models import ICSetting


class ICSettingForm(forms.ModelForm):
    class Meta:
        model = ICSetting
        fields = ("name", "model_number", "voltage", "mode", "axis", "efficiency", "points", "source")
        widgets: ClassVar = {
            "points": forms.Textarea(attrs={"rows": 8, "placeholder": "[[0, 60], [0.5, 85], [1, 90]]"}),
            "efficiency": forms.NumberInput(attrs={"min": 0, "max": 100, "step": "any"}),
            "voltage": forms.NumberInput(attrs={"min": "0.000001", "max": 1000000, "step": "any"}),
        }
        help_texts: ClassVar = {
            "name": "同一類 IC 的設定名稱不可重複；可用不同名稱保存同型號的不同量測條件。",
            "points": "JSON 格式，每點為 [X, 效率%]，至少 3 點，X 需遞增。選 mA 時例如 [[100, 80], [500, 92], [1000, 95]]。固定效率模式可留空。",
            "efficiency": "固定效率模式必填，範圍 0–100%。曲線模式忽略此欄位。",
            "axis": "曲線模式使用；mA 查表電流＝電池容量(mAh) × C-rate，A 則再除以 1000；功率為設定的充電瓦特數。切換單位時請同步換算資料點。",
            "voltage": "量測工作電壓，可填 3.8 等數值；歷史資料未知時可留白。此欄不會自動換算效率。",
        }


class ICImportForm(forms.ModelForm):
    file = forms.FileField(label="效率資料檔案", widget=forms.ClearableFileInput(attrs={"accept": ".xlsx,.csv"}))
    worksheet = forms.CharField(label="要匯入的工作表", required=False, strip=False,
                                widget=forms.Select(choices=[("", "請先選擇 XLSX 檔案")]))
    voltage = forms.FloatField(label="無電壓欄時使用的電壓 (V)", required=False, min_value=0.000001, max_value=1000000,
                               widget=forms.NumberInput(attrs={"step": "any", "placeholder": "留白自動讀取，例如 3.8"}),
                               help_text="檔案有電壓欄時優先 VBAT，其次 VIN／工作電壓，依不同電壓建立多筆資料；此欄只用於檔案沒有電壓欄的情況。")

    class Meta:
        model = ICSetting
        fields = ("file", "worksheet", "voltage", "source")
        help_texts: ClassVar = {"source": "補充資料來源、電池電壓與量測邊界。"}

    def _post_clean(self):
        if self.errors:
            return
        for item in self.settings:
            try:
                item.full_clean()
            except ValidationError as error:
                self.add_error(None, f'{item.name}：{"；".join(error.messages)}')

    def save(self, commit=True):
        if self.errors:
            raise ValueError("匯入資料驗證失敗，不能儲存。")
        if commit:
            with transaction.atomic():
                for item in self.settings:
                    item.save()
        return self.settings

    def clean(self):
        data = super().clean()
        if any(field not in data for field in ("file", "voltage")):
            return data
        is_excel = Path(data["file"].name).suffix.lower() == ".xlsx"
        worksheet = data.get("worksheet", "") if is_excel else ""
        if is_excel and not worksheet:
            self.add_error("worksheet", "請選擇要匯入的工作表。")
            return data
        origin = worksheet if is_excel else Path(data["file"].name).stem
        name_field = "worksheet" if is_excel else "file"
        data["model_number"] = re.sub(r"^(?:charger|cherger|rx)(?:[\s_-]+|$)", "", origin.strip(), flags=re.IGNORECASE).strip()
        data["model_number"] = re.sub(r"_\d+(?:\.\d+)?V$", "", data["model_number"], flags=re.IGNORECASE).strip()
        if not data["model_number"]:
            self.add_error(name_field, "移除前綴後型號不可空白，請調整檔名或工作表名稱。")
            return data
        try:
            self.result = read_curve(data["file"], worksheet, data["voltage"])
        except ValueError as error:
            self.add_error("file", str(error))
            return data
        self.settings = []
        for curve in self.result["curves"]:
            name = f'{data["model_number"]}_{curve["voltage"]:.15g}V'
            if len(name) > ICSetting._meta.get_field("name").max_length:
                self.add_error(name_field, "型號加上電壓後綴後不可超過 120 字。")
                return data
            provenance = f'{self.result["voltage_source"]}={curve["voltage"]:.15g}V；{worksheet if is_excel else data["file"].name}；{self.result["notes"]}'
            source = "；".join(filter(None, [data.get("source"), provenance]))
            if len(source) > 500:
                self.add_error("source", "來源及工作表說明合計超過 500 字，請縮短來源文字或表頭說明。")
                return data
            self.settings.append(ICSetting(kind=self.instance.kind, name=name, model_number=data["model_number"],
                                           voltage=curve["voltage"], mode="curve", axis=self.result["axis"],
                                           points=curve["points"], source=source))
        self.instance = self.settings[0]
        return data
