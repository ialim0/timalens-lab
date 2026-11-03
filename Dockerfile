# syntax=docker/dockerfile:1.7
# TimaLens Lab: one image with the FastAPI server, the static web app, Node (the lab checker) and ffmpeg.

ARG PYTHON_VERSION=3.12

# ---------------------------------------------------------------- build: install Python deps into a venv
FROM python:${PYTHON_VERSION}-slim AS build

ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /src
COPY pyproject.toml README.md LICENSE ./
COPY app ./app
RUN pip install .

# ---------------------------------------------------------------- runtime
FROM python:${PYTHON_VERSION}-slim AS runtime

LABEL org.opencontainers.image.title="TimaLens Lab" \
      org.opencontainers.image.description="Upload a lesson, get an interactive electric-circuits lab." \
      org.opencontainers.image.licenses="MIT"

# node runs the circuit engine's checker; ffmpeg reads recorded lessons and voice questions
RUN apt-get update \
 && apt-get install -y --no-install-recommends nodejs ffmpeg \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --uid 10001 --user-group timalens

COPY --from=build /opt/venv /opt/venv

WORKDIR /app
COPY --chown=timalens:timalens app ./app
COPY --chown=timalens:timalens web ./web
COPY --chown=timalens:timalens samples ./samples
COPY --chown=timalens:timalens tools ./tools
RUN mkdir -p /app/data && chown timalens:timalens /app/data

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DATA_DIR=/app/data \
    PORT=8080

USER timalens
VOLUME /app/data
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/api/health', timeout=4)"

# PORT is set by Cloud Run and most PaaS; 8080 otherwise
CMD ["sh", "-c", "exec uvicorn app.server:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
