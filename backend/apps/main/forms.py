from typing import ClassVar

from django import forms

from .models import ICSetting


class ICSettingForm(forms.ModelForm):
    class Meta:
        model = ICSetting
        fields = ("name", "model_number", "mode", "axis", "efficiency", "points", "provisional", "source")
        widgets: ClassVar = {
            "points": forms.Textarea(attrs={"rows": 8, "placeholder": "[[0, 60], [0.5, 85], [1, 90]]"}),
            "efficiency": forms.NumberInput(attrs={"min": 0, "max": 100, "step": "any"}),
        }
        help_texts: ClassVar = {
            "name": "同一類 IC 的設定名稱不可重複；可用不同名稱保存同型號的不同量測條件。",
            "points": "JSON 格式，每點為 [X, 效率%]，至少 3 點，X 需遞增。固定效率模式可留空。",
            "efficiency": "固定效率模式必填，範圍 0–100%。曲線模式忽略此欄位。",
            "axis": "曲線模式使用；電流為電池容量 × C-rate，功率為設定的充電瓦特數。",
        }
