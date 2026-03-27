from django.contrib import admin
from django.urls import path

from app import views

urlpatterns = [
    path("", views.index),
    path("admin/", admin.site.urls),
    path("api/domain/<int:domain_id>/", views.domain_data),
]
