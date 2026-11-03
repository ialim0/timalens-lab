# Security policy

## Reporting a vulnerability

Please **do not** open a public issue. Use GitHub's
[private vulnerability reporting](../../security/advisories/new) instead, with steps to reproduce.
We aim to answer within a few days.

## How secrets are handled

- `MODEL_API_KEY` is read from the environment on the server only; the browser never sees it.
- Locally it lives in `.env`, which is git-ignored. In the cloud it lives in Google Secret
  Manager and reaches Cloud Run as a secret reference.
- Terraform stores the key in its state: keep the state private (a locked-down GCS bucket).
- If a key leaks, revoke it in the Meta Model API dashboard and rotate it:
  `TF_VAR_model_api_key=<new> make deploy PROJECT=<id>`.

## Scope notes

- Uploads are capped at 50 MB and processed in a temporary directory.
- Lab and session ids are validated (`^[a-z0-9-]{3,64}$`) before touching the disk.
- The demo deployment is public by design (students open a link). Set `public = false` in
  Terraform to require Google sign-in.
