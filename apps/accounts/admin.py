from django.contrib import admin

from .models import PlatformUser


@admin.register(PlatformUser)
class PlatformUserAdmin(admin.ModelAdmin):
    list_display = ("id", "username", "email", "role", "is_active", "created_at", "last_login_at")
    list_filter = ("role", "is_active")
    search_fields = ("username", "email")
    readonly_fields = ("id", "google_sub", "created_at", "last_login_at")
    fields = ("id", "email", "username", "role", "is_active", "google_sub", "created_at", "last_login_at")

    def has_add_permission(self, request):
        return False  # Accounts are created only by verified Google sign-in.

    def has_change_permission(self, request, obj=None):
        return request.user.is_superuser

    def has_delete_permission(self, request, obj=None):
        return request.user.is_superuser

    def has_view_permission(self, request, obj=None):
        return request.user.is_superuser

    def has_module_permission(self, request):
        return request.user.is_superuser
