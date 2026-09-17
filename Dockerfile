# ── MediHawk Backend — Production Docker image ───────────────────────────────
#
# Architecture for Render:
#   - Frontend (React/Vite) → Vercel  (not built here)
#   - Backend (Flask/Gunicorn) → Render Web Service  (this image)
#   - Database → Render PostgreSQL  (DATABASE_URL injected by Render)
#
# Build: docker build -t medihawk-backend .
# Run:   docker run -p 5000:5000 --env-file .env.prod medihawk-backend

FROM python:3.12-slim

WORKDIR /app

# System-level dependencies for psycopg[binary] (bundled libpq, no extra apt)
# and for curl-based health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Python dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Application source
COPY backend/ ./

# Non-root user
RUN useradd --no-create-home --shell /bin/false medihawk \
    && mkdir -p /app/instance \
    && chown -R medihawk:medihawk /app
USER medihawk

EXPOSE 5000

# Health check — reports unhealthy if DB is unreachable
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:5000/api/health || exit 1

# Use Gunicorn for production — NOT Flask dev server
CMD ["gunicorn", \
     "--config", "/app/deployment/gunicorn.conf.py", \
     "--chdir", "/app", \
     "run:app"]
