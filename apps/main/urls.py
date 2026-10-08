from django.urls import path

from . import views

app_name = "main"

urlpatterns = [
    path("accounts/settings/", views.account_settings, name="account-settings"),
    path("", views.index, name="index"),
]
