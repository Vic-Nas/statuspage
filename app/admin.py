from django.contrib import admin
from django.utils import timezone

from .models import CheckResult, Domain, Incident


@admin.register(Domain)
class DomainAdmin(admin.ModelAdmin):
    list_display = ("name", "url", "active")
    list_editable = ("active",)
    search_fields = ("name", "url")  # required for autocomplete_fields


@admin.register(Incident)
class IncidentAdmin(admin.ModelAdmin):
    list_display = ("title", "domain", "resolved", "created_at", "resolved_at")
    list_filter = ("resolved", "domain")
    list_editable = ("resolved",)
    autocomplete_fields = ("domain",)

    def save_model(self, request, obj, form, change):
        if obj.resolved and not obj.resolved_at:
            obj.resolved_at = timezone.now()
        elif not obj.resolved:
            obj.resolved_at = None
        super().save_model(request, obj, form, change)


@admin.register(CheckResult)
class CheckResultAdmin(admin.ModelAdmin):
    list_display = ("domain", "checked_at", "up", "response_ms", "status_code")
    list_filter = ("domain", "up")
    readonly_fields = ("domain", "checked_at", "up", "response_ms", "status_code")
    date_hierarchy = "checked_at"
