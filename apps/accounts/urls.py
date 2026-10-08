from django.urls import path

from . import views

app_name = "accounts"

urlpatterns = [
    path("google/start/", views.google_start, name="google-start"),
    path("google/callback/", views.google_callback, name="google-callback"),
]
