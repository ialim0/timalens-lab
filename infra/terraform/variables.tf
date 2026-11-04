variable "project_id" {
  description = "Google Cloud project to deploy into."
  type        = string
}

variable "region" {
  description = "Region for Cloud Run, Artifact Registry and the data bucket."
  type        = string
  default     = "europe-west1"
}

variable "service_name" {
  description = "Name of the Cloud Run service (also prefixes the other resources)."
  type        = string
  default     = "timalens-lab"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,40}$", var.service_name))
    error_message = "Use 3-41 lowercase letters, digits or dashes, starting with a letter."
  }
}

variable "image" {
  description = "Container image to run. Leave empty to use <registry>/<service_name>:latest, as pushed by `make deploy`."
  type        = string
  default     = ""
}

variable "model_api_key" {
  description = "Meta Model API key. Pass it with TF_VAR_model_api_key; it is stored in Secret Manager (and in the Terraform state, so keep the state private)."
  type        = string
  sensitive   = true
}

variable "mistral_api_key" {
  description = "Optional Mistral API key, for Tima's Voxtral voice. Empty: the browser's voice speaks. Pass it with TF_VAR_mistral_api_key."
  type        = string
  sensitive   = true
  default     = ""
}

variable "env" {
  description = "Extra, non-secret settings for the app (e.g. PLANNER_MODEL, PLANNER_EFFORT, PLANNER_BASE_URL)."
  type        = map(string)
  default     = {}
}

variable "public" {
  description = "Let anyone with the link open the lab (students need this). Set false to require Google sign-in."
  type        = bool
  default     = true
}

variable "min_instances" {
  description = "Instances kept warm. 1 avoids cold starts during a demo; 0 costs nothing when idle."
  type        = number
  default     = 0
}

variable "cpu" {
  description = "vCPUs per instance."
  type        = string
  default     = "2"
}

variable "memory" {
  description = "Memory per instance (ffmpeg and PDF reading like room)."
  type        = string
  default     = "2Gi"
}

variable "labels" {
  description = "Labels added to every resource."
  type        = map(string)
  default     = { app = "timalens-lab" }
}
