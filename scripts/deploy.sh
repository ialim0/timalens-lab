#!/usr/bin/env bash
# Deploy TimaLens Lab to Google Cloud Run: create the registry, build the image with
# Cloud Build (no local Docker needed), then apply the rest of the infrastructure.
#
#   export TF_VAR_model_api_key=...      # Meta Model API key
#   scripts/deploy.sh <gcp-project-id> [region]
set -euo pipefail

PROJECT="${1:?usage: scripts/deploy.sh <gcp-project-id> [region]}"
REGION="${2:-europe-west1}"
TAG="${TAG:-$(git rev-parse --short HEAD 2>/dev/null || date +%s)}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TF=(terraform -chdir="$ROOT/infra/terraform")
VARS=(-var "project_id=$PROJECT" -var "region=$REGION")

: "${TF_VAR_model_api_key:?set TF_VAR_model_api_key to your Meta Model API key}"
command -v gcloud >/dev/null || { echo "gcloud is required: https://cloud.google.com/sdk/docs/install" >&2; exit 1; }
command -v terraform >/dev/null || { echo "terraform is required: https://developer.hashicorp.com/terraform/install" >&2; exit 1; }

echo "==> 1/3 Registry and APIs"
"${TF[@]}" init -input=false
"${TF[@]}" apply -input=false -auto-approve "${VARS[@]}" \
  -target=google_project_service.enabled -target=google_artifact_registry_repository.images

REPO="$("${TF[@]}" output -raw image_repository)"

echo "==> 2/3 Build $REPO:$TAG with Cloud Build"
gcloud builds submit "$ROOT" --project "$PROJECT" --region "$REGION" --tag "$REPO:$TAG"

echo "==> 3/3 Cloud Run, bucket, secret"
"${TF[@]}" apply -input=false -auto-approve "${VARS[@]}" -var "image=$REPO:$TAG"

echo
echo "TimaLens Lab is live at: $("${TF[@]}" output -raw url)"
