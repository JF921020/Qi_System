from django.urls import path

from . import views

app_name = "main"

urlpatterns = [
    path("api/main/", views.main_api, name="main"),
    path("", views.index, name="index"),
]
