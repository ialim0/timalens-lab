# TimaLens Lab: common tasks. Run `make` to list them.
.DEFAULT_GOAL := help
SHELL := /bin/bash

VENV   ?= .venv
PY     := $(VENV)/bin/python
PORT   ?= 8080
IMAGE  ?= timalens-lab:local
REGION ?= europe-west1

.PHONY: help
help: ## List the available tasks
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z0-9_-]+:.*##/ {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# ---------------------------------------------------------------- local development
$(VENV):
	python3 -m venv $(VENV)
	$(PY) -m pip install -q --upgrade pip
	$(PY) -m pip install -q -e ".[dev]"

frontend/node_modules: frontend/package-lock.json
	cd frontend && npm ci --no-audit --no-fund
	@touch $@

.PHONY: install
install: $(VENV) frontend/node_modules ## Install the server (virtualenv) and the web app (npm)

.PHONY: dev
dev: $(VENV) frontend/node_modules ## Run the API (:8080) and the web app with hot reload: open http://localhost:3000
	@[ -f .env ] && set -a && . ./.env && set +a; \
	trap 'kill 0' EXIT; \
	$(VENV)/bin/uvicorn app.server:app --reload --port 8080 & \
	cd frontend && NEXT_PUBLIC_LIVE_URL=ws://localhost:8080/api/live npm run dev

.PHONY: build
build: frontend/node_modules ## Build the web app to static files (frontend/out), served by the API
	cd frontend && npm run build

.PHONY: serve
serve: $(VENV) build ## Build, then run everything as in production on http://localhost:8080
	@[ -f .env ] && set -a && . ./.env && set +a; $(VENV)/bin/uvicorn app.server:app --port $(PORT)

.PHONY: test
test: $(VENV) frontend/node_modules ## Run the engine (Node) and server (pytest) tests
	node --test tests/*.test.mjs
	$(PY) -m pytest

.PHONY: e2e
e2e: $(VENV) build ## Run the end-to-end tests in Chrome (Playwright)
	cd frontend && npx playwright test

.PHONY: lint
lint: $(VENV) frontend/node_modules ## Lint Python, type-check the web app, check Terraform formatting
	$(VENV)/bin/ruff check .
	cd frontend && npm run typecheck
	@command -v terraform >/dev/null && terraform fmt -recursive -check infra || echo "terraform not installed: skipping"

.PHONY: format
format: $(VENV) ## Auto-fix lint issues and format Terraform
	$(VENV)/bin/ruff check --fix .
	@command -v terraform >/dev/null && terraform fmt -recursive infra || true

.PHONY: check-samples
check-samples: ## Run the lab checker on every sample lab
	@for f in samples/*.lab.json; do printf '%-32s ' "$$f"; node tools/check_lab.mjs "$$f" || exit 1; done

# ---------------------------------------------------------------- docker
.PHONY: docker-build
docker-build: ## Build the container image
	docker build -t $(IMAGE) .

.PHONY: up
up: ## Run the app with Docker Compose on http://localhost:8080
	docker compose up --build

.PHONY: down
down: ## Stop the Docker Compose stack
	docker compose down

# ---------------------------------------------------------------- cloud (Google Cloud Run)
.PHONY: deploy
deploy: ## Deploy to Cloud Run: make deploy PROJECT=<gcp-project> [REGION=europe-west1]
	@[ -n "$(PROJECT)" ] || { echo "usage: make deploy PROJECT=<gcp-project-id>"; exit 1; }
	DOMAIN=$(DOMAIN) scripts/deploy.sh $(PROJECT) $(REGION)

.PHONY: destroy
destroy: ## Tear the Cloud Run deployment down (the data bucket is kept unless emptied)
	@[ -n "$(PROJECT)" ] || { echo "usage: make destroy PROJECT=<gcp-project-id>"; exit 1; }
	terraform -chdir=infra/terraform destroy -var "project_id=$(PROJECT)" -var "region=$(REGION)"

.PHONY: clean
clean: ## Remove caches, builds, the virtualenv and node_modules
	rm -rf $(VENV) .pytest_cache .ruff_cache *.egg-info frontend/node_modules frontend/.next frontend/out
	find . -name __pycache__ -type d -prune -exec rm -rf {} +
