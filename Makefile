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
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# ---------------------------------------------------------------- local development
$(VENV):
	python3 -m venv $(VENV)
	$(PY) -m pip install -q --upgrade pip
	$(PY) -m pip install -q -e ".[dev]"

.PHONY: install
install: $(VENV) ## Create the virtualenv and install the app with dev tools

.PHONY: dev
dev: $(VENV) ## Run the server with auto-reload on http://localhost:8080 (PORT=… to change)
	@[ -f .env ] && set -a && . ./.env && set +a; $(VENV)/bin/uvicorn app.server:app --reload --port $(PORT)

.PHONY: test
test: $(VENV) ## Run the Node and Python test suites
	node --test tests/*.test.mjs
	$(PY) -m pytest

.PHONY: lint
lint: $(VENV) ## Lint Python and check Terraform formatting
	$(VENV)/bin/ruff check .
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
	scripts/deploy.sh $(PROJECT) $(REGION)

.PHONY: destroy
destroy: ## Tear the Cloud Run deployment down (the data bucket is kept unless emptied)
	@[ -n "$(PROJECT)" ] || { echo "usage: make destroy PROJECT=<gcp-project-id>"; exit 1; }
	terraform -chdir=infra/terraform destroy -var "project_id=$(PROJECT)" -var "region=$(REGION)"

.PHONY: clean
clean: ## Remove caches and the virtualenv
	rm -rf $(VENV) .pytest_cache .ruff_cache *.egg-info
	find . -name __pycache__ -type d -prune -exec rm -rf {} +
