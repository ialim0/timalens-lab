output "url" {
  description = "Public URL of the lab."
  value       = google_cloud_run_v2_service.app.uri
}

output "image_repository" {
  description = "Where to push images: docker push <this>:<tag>."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}/${var.service_name}"
}

output "data_bucket" {
  description = "Bucket holding generated labs and saved sessions."
  value       = google_storage_bucket.data.name
}

output "dns_records" {
  description = "The DNS records to add at your DNS host for the custom domain (empty without one)."
  value       = var.domain == "" ? [] : [for r in google_cloud_run_domain_mapping.app[0].status[0].resource_records : "${r.type} ${r.name} -> ${r.rrdata}"]
}
