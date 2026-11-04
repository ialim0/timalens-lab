# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Tima, the voice guide: Muse Voice Transcribe realtime (ears), Muse Spark vision on a picture
  of the bench, streamed answers, Voxtral voice; "Hey Tima", follow-up replies, barge-in.
- Drag-and-drop building in 2D and 3D, an immersive 3D world, WebXR (Meta Quest).
- End-to-end tests (Playwright).

### Changed
- The web app is now Next.js (React + TypeScript), exported as static files the FastAPI server
  serves; old `lab.html?lab=…` links redirect.
- Measurements are taken automatically; the Measurements tab is gone.

## [0.1.0] - 2026-11-03

### Added
- Lab generation from a lesson (PDF, DOCX, PPTX, photo, audio/video) with Muse Spark 1.3,
  checked and repaired by the circuit engine.
- Student lab with a 2D schematic, a 3D bench, a grounded Socratic tutor and an MP4 replay.
- French and English everywhere; lab content in Wolof, Hausa, Yorùbá, Fɔngbè, Kiswahili, Bamanankan.
- Multi-stage Dockerfile, Docker Compose, Terraform for Google Cloud Run, GitHub Actions CI.
