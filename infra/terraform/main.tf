locals {
  image = var.image != "" ? var.image : "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}/${var.service_name}:latest"

  services = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "secretmanager.googleapis.com",
    "storage.googleapis.com",
  ])

  # the container runs as this user (see the Dockerfile); the bucket is mounted for it
  app_uid = 10001
}

# ---------------------------------------------------------------- APIs
resource "google_project_service" "enabled" {
  for_each = local.services

  service            = each.value
  disable_on_destroy = false
}

# ---------------------------------------------------------------- images
resource "google_artifact_registry_repository" "images" {
  repository_id = var.service_name
  location      = var.region
  format        = "DOCKER"
  description   = "TimaLens Lab container images"
  labels        = var.labels

  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 10
    }
  }

  depends_on = [google_project_service.enabled]
}

# ---------------------------------------------------------------- data: generated labs and saved sessions
resource "google_storage_bucket" "data" {
  name                        = "${var.project_id}-${var.service_name}-data"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  labels                      = var.labels

  versioning {
    enabled = true
  }

  depends_on = [google_project_service.enabled]
}

# ---------------------------------------------------------------- secret: the Meta Model API key
resource "google_secret_manager_secret" "model_api_key" {
  secret_id = "${var.service_name}-model-api-key"
  labels    = var.labels

  replication {
    auto {}
  }

  depends_on = [google_project_service.enabled]
}

resource "google_secret_manager_secret_version" "model_api_key" {
  secret      = google_secret_manager_secret.model_api_key.id
  secret_data = var.model_api_key
}

# ---------------------------------------------------------------- identity: least privilege for the service
resource "google_service_account" "app" {
  account_id   = var.service_name
  display_name = "TimaLens Lab (Cloud Run)"
}

resource "google_secret_manager_secret_iam_member" "app_reads_key" {
  secret_id = google_secret_manager_secret.model_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.app.member
}

resource "google_storage_bucket_iam_member" "app_uses_data" {
  bucket = google_storage_bucket.data.name
  role   = "roles/storage.objectUser"
  member = google_service_account.app.member
}

# ---------------------------------------------------------------- the app
resource "google_cloud_run_v2_service" "app" {
  name                = var.service_name
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false
  labels              = var.labels

  template {
    service_account                  = google_service_account.app.email
    execution_environment            = "EXECUTION_ENVIRONMENT_GEN2" # needed for the bucket mount
    timeout                          = "900s"                       # video conversion can take minutes
    max_instance_request_concurrency = 40

    # Lab generation runs as a background job tracked in memory, so every request must reach
    # the same instance: keep one instance, and keep its CPU on between requests.
    scaling {
      min_instance_count = var.min_instances
      max_instance_count = 1
    }

    volumes {
      name = "data"
      gcs {
        bucket        = google_storage_bucket.data.name
        read_only     = false
        mount_options = ["uid=${local.app_uid}", "gid=${local.app_uid}", "file-mode=644", "dir-mode=755"]
      }
    }

    containers {
      image = local.image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
        cpu_idle          = false
        startup_cpu_boost = true
      }

      env {
        name  = "DATA_DIR"
        value = "/app/data"
      }

      env {
        name = "MODEL_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.model_api_key.secret_id
            version = "latest"
          }
        }
      }

      dynamic "env" {
        for_each = var.env
        content {
          name  = env.key
          value = env.value
        }
      }

      volume_mounts {
        name       = "data"
        mount_path = "/app/data"
      }

      startup_probe {
        http_get {
          path = "/api/health"
        }
        period_seconds    = 5
        failure_threshold = 12
      }

      liveness_probe {
        http_get {
          path = "/api/health"
        }
        period_seconds = 30
      }
    }
  }

  depends_on = [
    google_project_service.enabled,
    google_secret_manager_secret_iam_member.app_reads_key,
    google_secret_manager_secret_version.model_api_key,
    google_storage_bucket_iam_member.app_uses_data,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  count = var.public ? 1 : 0

  name     = google_cloud_run_v2_service.app.name
  location = google_cloud_run_v2_service.app.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}
