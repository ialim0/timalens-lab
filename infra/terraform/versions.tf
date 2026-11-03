terraform {
  required_version = ">= 1.6"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 6.20, < 8.10"
    }
  }

  # For a team, keep the state in a bucket instead of on your laptop:
  # backend "gcs" {
  #   bucket = "my-terraform-state"
  #   prefix = "timalens-lab"
  # }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
