import math
import uuid

from django.core.exceptions import ValidationError
from django.db import models


def number(value, field, minimum=0, maximum=1_000_000):
    """Validate numeric IC settings before database writes."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{field} 必須是數字")  # noqa: TRY004 - shared validation API uses ValueError
    if not minimum <= value <= maximum or not math.isfinite(value):
        raise ValueError(f"{field} 必須介於 {minimum} 與 {maximum}")
    return value


def ic_code():
    return "ic_" + uuid.uuid4().hex


class ICSetting(models.Model):
    kind = models.CharField("類型", max_length=7, choices=[("rx", "Rx IC"), ("charger", "Charger IC")])
    code = models.SlugField(default=ic_code, unique=True, editable=False)
    name = models.CharField("設定名稱", max_length=120)
    model_number = models.CharField("IC 型號", max_length=120)
    mode = models.CharField("效率來源", max_length=5, choices=[("curve", "資料庫曲線查表"), ("fixed", "自訂固定效率")], default="curve")
    axis = models.CharField("查表軸向", max_length=7, choices=[("power", "輸出功率 (W)"), ("current", "充電電流 (A)"), ("ma", "充電電流 (mA)")], default="current")
    efficiency = models.FloatField("固定效率 (%)", null=True, blank=True)
    points = models.JSONField("曲線資料點", default=list, blank=True)
    voltage = models.FloatField("工作電壓 (V)", null=True, blank=True)
    provisional = models.BooleanField("暫定數據（尚未驗證）", default=True)
    source = models.CharField("資料來源／量測條件", max_length=500, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "main_icsetting"
        ordering = ("kind", "name")
        constraints = (
            models.UniqueConstraint(fields=["kind", "name"], name="unique_ic_setting_name"),
            models.UniqueConstraint(fields=["kind", "model_number", "voltage"], name="unique_ic_model_voltage"),
        )

    def __str__(self):
        return self.name

    def clean(self):
        super().clean()
        if self.voltage is not None:
            try:
                number(self.voltage, "工作電壓", 0.000001)
            except ValueError as error:
                raise ValidationError({"voltage": str(error)}) from error
        self.model_number = self.model_number.strip()
        if self.voltage is not None and ICSetting.objects.filter(
            kind=self.kind, model_number__iexact=self.model_number, voltage=self.voltage,
        ).exclude(pk=self.pk).exists():
            raise ValidationError("此類 IC 的型號與電壓已有設定，請編輯既有資料；不會覆蓋原資料。")
        if self.mode == "fixed":
            try:
                number(self.efficiency, "固定效率", 0, 100)
            except ValueError as error:
                raise ValidationError({"efficiency": str(error)}) from error
            self.points = []
        elif self.mode == "curve":
            try:
                if not isinstance(self.points, list) or not 3 <= len(self.points) <= 10000:
                    raise ValueError("曲線需有 3 至 10000 個資料點。")
                previous = -1
                for point in self.points:
                    if not isinstance(point, list) or len(point) != 2:
                        raise ValueError("每點必須為 [X, 效率百分比]。")
                    x = number(point[0], "X")
                    number(point[1], "效率", 0, 100)
                    if x <= previous:
                        raise ValueError("X 必須嚴格遞增，不可重複。")
                    previous = x
            except ValueError as error:
                raise ValidationError({"points": str(error)}) from error
            self.efficiency = None
