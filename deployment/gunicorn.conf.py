"""
Gunicorn production configuration for MediHawk backend.
Usage:  gunicorn -c deployment/gunicorn.conf.py 'run:app'

Worker count: keep low on Render free/starter tiers (512MB–1GB RAM).
Default is 2. Raise GUNICORN_WORKERS for paid tiers.
Do NOT use cpu_count() * 2 + 1 on Render — that formula produces too many
workers for shared-CPU instances and exhausts the PostgreSQL connection pool.

Note: When Flask-SocketIO is added (Phase 1H), worker_class must switch to
'eventlet' or 'geventlet' and workers should be set to 1.
"""
import os

# ── Binding ───────────────────────────────────────────────────────────────────
bind = f"0.0.0.0:{os.environ.get('PORT', '5000')}"

# ── Workers ───────────────────────────────────────────────────────────────────
workers = int(os.environ.get('GUNICORN_WORKERS', '2'))
worker_class = 'sync'  # switch to 'eventlet' when Flask-SocketIO is added
timeout = 120
keepalive = 5

# ── Logging ───────────────────────────────────────────────────────────────────
accesslog = '-'    # stdout
errorlog = '-'     # stderr
loglevel = os.environ.get('LOG_LEVEL', 'info').lower()
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s %(D)sµs'

# ── Process naming ────────────────────────────────────────────────────────────
proc_name = 'medihawk-backend'

# ── Security ──────────────────────────────────────────────────────────────────
limit_request_line = 4096
limit_request_fields = 100
