from django.db import models


class Domain(models.Model):
    name = models.CharField(max_length=255, unique=True, help_text="e.g. example.com")
    url = models.URLField(help_text="Full URL to poll, e.g. https://example.com")
    active = models.BooleanField(default=True)

    def __str__(self):
        return self.name

    @property
    def last_check(self):
        return self.checks.order_by("-checked_at").first()

    @property
    def uptime_24h(self):
        from django.utils import timezone
        from datetime import timedelta
        checks = self.checks.filter(checked_at__gte=timezone.now() - timedelta(hours=24))
        total = checks.count()
        if not total:
            return None
        return round(checks.filter(up=True).count() / total * 100, 1)


class CheckResult(models.Model):
    domain = models.ForeignKey(Domain, on_delete=models.CASCADE, related_name="checks")
    checked_at = models.DateTimeField(auto_now_add=True, db_index=True)
    up = models.BooleanField()
    response_ms = models.IntegerField(null=True, blank=True)
    status_code = models.IntegerField(null=True, blank=True)

    class Meta:
        ordering = ["-checked_at"]


class Incident(models.Model):
    domain = models.ForeignKey(Domain, on_delete=models.CASCADE, related_name="incidents", null=True, blank=True)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    resolved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        status = "✓" if self.resolved else "!"
        return f"[{status}] {self.title}"
