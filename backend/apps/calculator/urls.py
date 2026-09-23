from django.urls import path

from . import views

app_name = "calculator"

urlpatterns = [
    path("api/calculate/", views.calculate_api, name="calculate"),
    path("", views.index, name="index"),
]
