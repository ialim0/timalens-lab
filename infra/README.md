# Deploying TimaLens Lab to Google Cloud Run

`infra/terraform` creates everything the app needs, with least-privilege access:

| Resource | Why |
|---|---|
| Artifact Registry repository | holds the container images (keeps the 10 most recent) |
| Cloud Run service (gen2) | runs the container; public link for students |
| GCS bucket, mounted at `/app/data` | generated labs and saved sessions survive redeploys (versioned, never public) |
| Secret Manager secret | the Meta `MODEL_API_KEY`, injected as an env var |
| Service account | may only read that secret and use that bucket |

## One-command deploy

You need `gcloud` (logged in: `gcloud auth login && gcloud auth application-default login`),
Terraform ≥ 1.6, and a GCP project with billing. Docker is **not** needed: Cloud Build makes
the image (as linux/amd64, even from an Apple Silicon Mac).

```bash
export TF_VAR_model_api_key=...          # Meta Model API key
make deploy PROJECT=my-gcp-project       # REGION=europe-west1 by default
```

`scripts/deploy.sh` runs three steps: it enables the APIs and creates the registry, builds
and pushes the image tagged with the git commit, then applies the rest. It prints the URL.

Redeploy after a code change with the same command. Tear down with `make destroy PROJECT=…`
(the data bucket refuses to be deleted while it holds labs: empty it first if you mean it).

## Settings

Copy `terraform/terraform.tfvars.example` to `terraform.tfvars` (git-ignored) for anything
beyond the project and region. Useful ones:

- `min_instances = 1`: no cold start during a live demo.
- `env = { PLANNER_MODEL = "...", PLANNER_BASE_URL = "..." }`: model settings (open-weight server, etc.).
- `public = false`: require Google sign-in instead of a public link.

For a team, enable the `gcs` backend in `versions.tf` so the state (which contains the API
key) lives in a private bucket instead of a laptop.

## Things to know

- **One instance.** Lab generation runs as a background job tracked in memory, so the
  service is capped at one instance with CPU always on. One instance with 2 vCPUs serves a
  classroom comfortably. Scaling out would need a shared job store (Redis, Firestore).
- **32 MB request limit.** Cloud Run caps HTTP/1 request bodies at 32 MB, below the app's
  own 50 MB upload limit. Large lesson recordings must be trimmed. Video conversion only
  serves browsers without WebCodecs, so it is rarely needed.
- **First build permissions.** On some new projects Cloud Build's service account cannot push
  to Artifact Registry yet. If step 2 fails with a permission error, grant it
  `roles/artifactregistry.writer` and rerun.
- **Cost.** With `min_instances = 0` the service costs nothing while idle; the bucket and
  registry cost cents a month.

## Other hosts

The image is a plain container listening on `$PORT` (default 8080) with `/api/health` as
its health check. It runs as-is on Fly.io, Render, Railway, Azure Container Apps or a VM
with `docker compose up -d`. Mount a persistent volume at `/app/data`.
