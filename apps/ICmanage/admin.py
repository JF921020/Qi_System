from django.contrib import admin

from .forms import ICSettingForm
from .models import ICSetting


@admin.register(ICSetting)
class ICSettingAdmin(admin.ModelAdmin):
    form = ICSettingForm
    list_display = ("name", "kind", "model_number", "mode", "updated_at")
    list_filter = ("kind", "mode")
    exclude = ("provisional",)
    search_fields = ("name", "model_number")
