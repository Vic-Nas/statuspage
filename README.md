# app

A lightweight Django status page with live polling, charts, and incident tracking.

## Setup

```bash
pip install -r requirements.txt

# Set env vars (or export them)
export FREQUENCY=60          # seconds between polls
export SECRET_KEY="your-secret"
export DEBUG=false
export ALLOWED_HOSTS="yourdomain.com"

python manage.py makemigrations app
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

## Env vars

| Variable | Default | Description |
|---|---|---|
| `FREQUENCY` | `60` | Poll interval in seconds |
| `SECRET_KEY` | dev default | Django secret key |
| `DEBUG` | `true` | Set `false` in production |
| `ALLOWED_HOSTS` | `*` | Comma-separated allowed hosts |
| `DB_DIR` | project root | Directory where `db.sqlite3` is stored |

## Features

- **Public page** (`/`): per-domain up/down + response time charts, viewer-selectable time window (1h / 24h / 48h / 7d), live refresh
- **Admin** (`/admin`): add/edit `Domain` and `Incident` objects, mark incidents resolved
- **Auto-poll**: APScheduler polls all active domains at `FREQUENCY` seconds on startup
- **Daily purge**: resolved incidents older than 24h are deleted at 3 AM UTC

## Notes

- Add domains to monitor via the admin page (`/admin`).
- `CheckResult` rows accumulate — consider a cron to prune old ones (e.g. keep 7 days).
- For production, use gunicorn: `gunicorn app.wsgi` (scheduler starts via `apps.py` ready hook).