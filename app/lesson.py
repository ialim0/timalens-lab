"""The text of a teacher's lesson: PDF, Word, PowerPoint, plain text, a photo (a blackboard,
a notebook or textbook page, read by Muse Spark's vision; scanned PDFs too), or a recording
(audio or video, transcribed by Muse Voice Transcribe)."""

from __future__ import annotations

import subprocess
from collections.abc import Callable
from io import BytesIO
from pathlib import Path

from app.config import settings

IMAGES = {".jpg", ".jpeg", ".png", ".webp"}
AUDIO = {".mp3", ".wav", ".m4a", ".ogg", ".webm", ".mp4", ".mov", ".aac", ".flac"}


class LessonError(ValueError):
    """The file cannot be read as a lesson; the message says why."""


def _scanned_pages(reader) -> list[bytes]:
    """The page images of a scanned PDF (a scan is one picture per page)."""
    images: list[bytes] = []
    for page in reader.pages[:12]:
        pictures = sorted(page.images, key=lambda im: -len(im.data))
        if pictures:
            picture = pictures[0]
            if picture.image is not None:  # re-encode as JPEG: scans are often JBIG2, CCITT, JPX
                out = BytesIO()
                picture.image.convert("RGB").save(out, "JPEG", quality=85)
                images.append(out.getvalue())
    return images


def extract_text(path: Path, *, transcriber: Callable[[Path], str] | None = None,
                 reader: Callable[[list[bytes]], str] | None = None) -> str:
    """The lesson's text. A transcriber turns a WAV into words; a reader turns page images into text."""
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        from pypdf import PdfReader

        try:
            pdf = PdfReader(str(path))
            text = "\n\n".join(page.extract_text() or "" for page in pdf.pages)
            if len(text.strip()) >= 50:
                return text
            scans = _scanned_pages(pdf)
        except Exception as exc:
            raise LessonError(f"the PDF could not be read: {exc}") from exc
        if not scans or reader is None:
            raise LessonError("this PDF has no text layer and no page images: export it with its text, or paste the lesson")
        return reader(scans)
    if suffix in IMAGES:
        if reader is None:
            raise LessonError("photos of a lesson need Muse Spark")
        return reader([path.read_bytes()])
    if suffix == ".docx":
        from docx import Document

        return "\n".join(p.text for p in Document(str(path)).paragraphs)
    if suffix == ".pptx":
        from pptx import Presentation

        slides = []
        for slide in Presentation(str(path)).slides:
            slides.append("\n".join(shape.text_frame.text for shape in slide.shapes if shape.has_text_frame))
        return "\n\n".join(slides)
    if suffix in {".txt", ".md"}:
        return path.read_text(errors="replace")
    if suffix in AUDIO:
        if transcriber is None:
            raise LessonError("recordings need Muse Voice Transcribe")
        wav = path.with_suffix(".lesson.wav")
        command = [settings().ffmpeg, "-y", "-loglevel", "error", "-i", str(path), "-t", "600", "-ac", "1", "-ar", "24000", "-sample_fmt", "s16", str(wav)]
        convert = subprocess.run(command, capture_output=True, check=False)
        if convert.returncode != 0:
            raise LessonError("the recording could not be read")
        return transcriber(wav)
    raise LessonError(f"{suffix or 'this'} files are not supported: use PDF, DOCX, PPTX, TXT, a photo, or an audio or video recording")
