from django.urls import path

from . import views

app_name = "main"

urlpatterns = [
    path("ics/<str:kind>/", views.ic_list, name="ic-list"),
    path("ics/<str:kind>/new/", views.ic_edit, name="ic-new"),
    path("ics/<str:kind>/<int:pk>/edit/", views.ic_edit, name="ic-edit"),
    path("ics/<str:kind>/<int:pk>/delete/", views.ic_delete, name="ic-delete"),
    path("api/main/", views.main_api, name="main"),
    path("", views.index, name="index"),
]
