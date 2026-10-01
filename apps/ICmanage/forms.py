import re
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
    voltage = forms.TypedChoiceField(label="匯入電壓", choices=[(5, "5V"), (12, "12V")], coerce=int, initial=5,
                                    help_text="有電壓欄時僅匯入符合的列；無電壓欄時，請確認整份資料屬於此電壓。")

    class Meta:
        model = ICSetting
        fields = ("model_number", "file", "voltage", "source")
        labels: ClassVar = {"model_number": "IC 型號／Excel 工作表名稱"}
        help_texts: ClassVar = {"model_number": "Excel 請填完整工作表名稱，例如 Charger_MP2733、Rx_CV8045D；CSV 直接填型號。自動移除 Charger／cherger／Rx 前綴與 _5V／_12V 後綴，設定名稱由型號加上所選電壓產生，例如 MP2733_5V。",
                               "source": "補充資料來源、電池電壓與量測邊界。"}

    def _post_clean(self):
        # A failed upload has no model curve to validate yet.
        if not self.errors:
            super()._post_clean()

    def clean(self):
        data = super().clean()
        if any(field not in data for field in ("file", "voltage", "model_number")):
            return data
        worksheet = data["model_number"]
        data["model_number"] = re.sub(r"^(?:charger|cherger|rx)(?:[\s_-]+|$)", "", worksheet, flags=re.IGNORECASE).strip()
        data["model_number"] = re.sub(r"_(?:5|12)V$", "", data["model_number"], flags=re.IGNORECASE).strip()
        if not data["model_number"]:
            self.add_error("model_number", "移除前綴後型號不可空白，請填寫完整型號／工作表名稱。")
            return data
        name = f'{data["model_number"]}_{data["voltage"]}V'
        if len(name) > ICSetting._meta.get_field("name").max_length:
            self.add_error("model_number", "型號加上電壓後綴後不可超過 120 字。")
            return data
        self.instance.name = data["name"] = name
        try:
            self.result = read_curve(data["file"], worksheet, data["voltage"])
        except ValueError as error:
            self.add_error("file", str(error))
            return data
        self.instance.mode = "curve"
        self.instance.axis = self.result["axis"]
        self.instance.points = self.result["points"]
        provenance = f'{data["voltage"]}V；{worksheet}；{self.result["notes"]}'
        data["source"] = "；".join(filter(None, [data.get("source"), provenance]))
        if len(data["source"]) > 500:
            self.add_error("source", "來源及工作表說明合計超過 500 字，請縮短來源文字或表頭說明。")
        return data
