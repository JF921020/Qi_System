import re
from pathlib import Path
from typing import ClassVar

from django import forms

from .importer import read_curve
from .models import ICSetting


class ICSettingForm(forms.ModelForm):
    class Meta:
        model = ICSetting
        fields = ("name", "model_number", "mode", "axis", "efficiency", "points", "source")
        widgets: ClassVar = {
            "points": forms.Textarea(attrs={"rows": 8, "placeholder": "[[0, 60], [0.5, 85], [1, 90]]"}),
            "efficiency": forms.NumberInput(attrs={"min": 0, "max": 100, "step": "any"}),
        }
        help_texts: ClassVar = {
            "name": "同一類 IC 的設定名稱不可重複；可用不同名稱保存同型號的不同量測條件。",
            "points": "JSON 格式，每點為 [X, 效率%]，至少 3 點，X 需遞增。選 mA 時例如 [[100, 80], [500, 92], [1000, 95]]。固定效率模式可留空。",
            "efficiency": "固定效率模式必填，範圍 0–100%。曲線模式忽略此欄位。",
            "axis": "曲線模式使用；mA 查表電流＝電池容量(mAh) × C-rate，A 則再除以 1000；功率為設定的充電瓦特數。切換單位時請同步換算資料點。",
        }


class ICImportForm(forms.ModelForm):
    file = forms.FileField(label="效率資料檔案", widget=forms.ClearableFileInput(attrs={"accept": ".xlsx,.csv"}))
    worksheet = forms.CharField(label="要匯入的工作表", required=False, strip=False,
                                widget=forms.Select(choices=[("", "請先選擇 XLSX 檔案")]))
    voltage = forms.TypedChoiceField(label="匯入電壓", choices=[(5, "5V"), (12, "12V")], coerce=int, initial=5,
                                    help_text="有電壓欄時僅匯入符合的列；無電壓欄時，請確認整份資料屬於此電壓。")

    class Meta:
        model = ICSetting
        fields = ("file", "worksheet", "voltage", "source")
        help_texts: ClassVar = {"source": "補充資料來源、電池電壓與量測邊界。"}

    def _post_clean(self):
        # A failed upload has no model curve to validate yet.
        if not self.errors:
            super()._post_clean()

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
        data["model_number"] = re.sub(r"_(?:5|12)V$", "", data["model_number"], flags=re.IGNORECASE).strip()
        if not data["model_number"]:
            self.add_error(name_field, "移除前綴後型號不可空白，請調整檔名或工作表名稱。")
            return data
        name = f'{data["model_number"]}_{data["voltage"]}V'
        if len(name) > ICSetting._meta.get_field("name").max_length:
            self.add_error(name_field, "型號加上電壓後綴後不可超過 120 字。")
            return data
        self.instance.name = data["name"] = name
        self.instance.model_number = data["model_number"]
        try:
            self.result = read_curve(data["file"], worksheet, data["voltage"])
        except ValueError as error:
            self.add_error("file", str(error))
            return data
        self.instance.mode = "curve"
        self.instance.axis = self.result["axis"]
        self.instance.points = self.result["points"]
        provenance = f'{data["voltage"]}V；{worksheet if is_excel else data["file"].name}；{self.result["notes"]}'
        data["source"] = "；".join(filter(None, [data.get("source"), provenance]))
        if len(data["source"]) > 500:
            self.add_error("source", "來源及工作表說明合計超過 500 字，請縮短來源文字或表頭說明。")
        return data
