import sys
from django.apps import AppConfig

# Commands that should NOT start the scheduler
_NO_SCHEDULER = {"migrate", "makemigrations", "shell", "collectstatic",
                 "createsuperuser", "dbshell", "check", "test"}


class AppConfig(AppConfig):
    name = "app"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        if sys.argv and sys.argv[0].endswith("manage.py"):
            cmd = sys.argv[1] if len(sys.argv) > 1 else ""
            if cmd in _NO_SCHEDULER:
                return
        from . import scheduler
        scheduler.start()
