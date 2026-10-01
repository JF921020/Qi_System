from django.urls import path

from . import views

app_name = "ICmanage"

urlpatterns = [
    path("ics/<str:kind>/", views.ic_list, name="ic-list"),
    path("ics/<str:kind>/import/", views.ic_import, name="ic-import"),
    path("ics/<str:kind>/<int:pk>/edit/", views.ic_edit, name="ic-edit"),
    path("ics/<str:kind>/<int:pk>/delete/", views.ic_delete, name="ic-delete"),
]
