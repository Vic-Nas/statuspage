import logging
import time
from datetime import timedelta

import requests
from django.conf import settings
from django.utils import timezone
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.jobstores.memory import MemoryJobStore

logger = logging.getLogger(__name__)
scheduler = BackgroundScheduler(
    jobstores={"default": MemoryJobStore()},
    timezone="UTC",
)


def poll_domains():
    from .models import Domain, CheckResult
    for domain in Domain.objects.filter(active=True):
        try:
            start = time.monotonic()
            resp = requests.get(domain.url, timeout=10, allow_redirects=True)
            elapsed = int((time.monotonic() - start) * 1000)
            CheckResult.objects.create(
                domain=domain,
                up=200 <= resp.status_code < 300,
                response_ms=elapsed,
                status_code=resp.status_code,
            )
        except Exception as e:
            CheckResult.objects.create(domain=domain, up=False)
            logger.warning("Failed to reach %s: %s", domain.url, e)


def purge_resolved_incidents():
    from .models import Incident
    cutoff = timezone.now() - timedelta(days=1)
    deleted, _ = Incident.objects.filter(resolved=True, resolved_at__lt=cutoff).delete()
    if deleted:
        logger.info("Purged %d resolved incidents", deleted)


def prune_check_results():
    from .models import CheckResult
    days = getattr(settings, "MONITOR_RETENTION_DAYS", 7)
    cutoff = timezone.now() - timedelta(days=days)
    deleted, _ = CheckResult.objects.filter(checked_at__lt=cutoff).delete()
    if deleted:
        logger.info("Pruned %d old check results", deleted)


def start():
    freq = settings.MONITOR_FREQUENCY

    scheduler.add_job(poll_domains, "interval", seconds=freq, id="poll_domains")
    scheduler.add_job(purge_resolved_incidents, "cron", hour=3, id="purge_incidents")
    scheduler.add_job(prune_check_results, "cron", hour=3, minute=15, id="prune_checks")
    scheduler.start()
    logger.info("Scheduler started (poll every %ds)", freq)