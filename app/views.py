from datetime import timedelta

from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, render
from django.utils import timezone

from .models import CheckResult, Domain, Incident


def index(request):
    domains = Domain.objects.filter(active=True)
    return render(request, "app/index.html", {
        "domains": domains,
        "refresh_interval": settings.MONITOR_FREQUENCY,
        "site_title": settings.SITE_TITLE,
    })


def domain_data(request, domain_id):
    domain = get_object_or_404(Domain, pk=domain_id, active=True)
    hours = int(request.GET.get("hours", 24))
    hours = min(max(hours, 1), 168)  # clamp 1h–7d

    since = timezone.now() - timedelta(hours=hours)
    checks = list(
        CheckResult.objects.filter(domain=domain, checked_at__gte=since)
        .order_by("checked_at")
        .values("checked_at", "up", "response_ms")
    )

    incidents = list(
        Incident.objects.filter(domain=domain)
        .values("title", "description", "resolved", "created_at", "resolved_at")
    )

    total = len(checks)
    uptime = round(sum(1 for c in checks if c["up"]) / total * 100, 1) if total else None

    return JsonResponse({
        "uptime": uptime,
        "checks": [
            {"t": c["checked_at"].isoformat(), "up": c["up"], "ms": c["response_ms"]}
            for c in checks
        ],
        "incidents": [
            {
                "title": i["title"],
                "description": i["description"],
                "resolved": i["resolved"],
                "created_at": i["created_at"].isoformat(),
                "resolved_at": i["resolved_at"].isoformat() if i["resolved_at"] else None,
            }
            for i in incidents
        ],
    })