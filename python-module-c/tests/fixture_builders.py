"""Shared fixture builders for the CV-extraction test suite.

Every builder here uses only libraries already in requirements.txt (Pillow,
pypdf, python-docx, stdlib) — no cupsfilter, no reportlab, no system fonts.
That's deliberate: these fixtures need to build identically in CI and on any
dev machine, not just the macOS box this suite was first written on.
"""
import codecs
import os
import tempfile

from docx import Document
from PIL import Image, ImageDraw
from pypdf import PdfReader, PdfWriter

SAMPLE_CV_PATH = os.path.join(os.path.dirname(__file__), "samplecv", "dulina-indrawansha-cv-2025.pdf")


def corrupt_pdf_path():
    fd, path = tempfile.mkstemp(suffix=".pdf")
    with os.fdopen(fd, "wb") as f:
        f.write(b"%PDF-1.4 this is not a real pdf structure, just garbage bytes")
    return path


def corrupt_docx_path():
    fd, path = tempfile.mkstemp(suffix=".docx")
    with os.fdopen(fd, "wb") as f:
        f.write(b"not a real docx file at all")
    return path


def table_docx_path():
    """A DOCX whose skills/contact info lives in a table, including one
    merged header cell — the exact shape Phase 0 added table extraction for."""
    doc = Document()
    doc.add_paragraph("Jane Doe")
    doc.add_paragraph("Summary")
    doc.add_paragraph("Experienced data analyst.")

    table = doc.add_table(rows=2, cols=3)
    merged = table.cell(0, 0).merge(table.cell(0, 1))
    merged.text = "Skills and Tools"
    table.cell(0, 2).text = "Contact"
    table.cell(1, 0).text = "Python, SQL, Power BI"
    table.cell(1, 1).text = "Python, SQL, Power BI"  # merged-cell duplicate, must be deduped
    table.cell(1, 2).text = "jane@example.com"

    fd, path = tempfile.mkstemp(suffix=".docx")
    os.close(fd)
    doc.save(path)
    return path


def encrypted_pdf_path(password):
    """Encrypt the real sample CV with the given user password ("" for the
    empty-password case pypdf/most export tools produce)."""
    writer = PdfWriter(clone_from=PdfReader(SAMPLE_CV_PATH))
    writer.encrypt(user_password=password)

    fd, path = tempfile.mkstemp(suffix=".pdf")
    with os.fdopen(fd, "wb") as f:
        writer.write(f)
    return path


def txt_path(text, encoding):
    fd, path = tempfile.mkstemp(suffix=".txt")
    with os.fdopen(fd, "wb") as f:
        f.write(text.encode(encoding))
    return path


def txt_path_with_bom(text, encoding, bom):
    fd, path = tempfile.mkstemp(suffix=".txt")
    with os.fdopen(fd, "wb") as f:
        f.write(bom + text.encode(encoding))
    return path


TXT_ENCODING_CASES = {
    "plain_ascii": lambda: txt_path("Plain ascii text, nothing fancy.", "ascii"),
    "cp1252_no_bom": lambda: txt_path("Café résumé — Sales Ünïcode test", "cp1252"),
    "utf8_bom": lambda: txt_path_with_bom("Software Engineer résumé", "utf-8", codecs.BOM_UTF8),
    "utf16_bom": lambda: txt_path_with_bom("Data Analyst — 3 years experience", "utf-16-le", codecs.BOM_UTF16_LE),
}


def synthetic_cv_image(lines):
    """A blank canvas with CV-shaped text drawn on it via Pillow's built-in
    default font — no system font install required, works identically
    anywhere Pillow runs."""
    image = Image.new("RGB", (1000, 700), color="white")
    draw = ImageDraw.Draw(image)
    y = 30
    for line in lines:
        draw.text((30, y), line, fill="black")
        y += 30
    return image


def synthetic_cv_image_path(lines):
    image = synthetic_cv_image(lines)
    fd, path = tempfile.mkstemp(suffix=".png")
    os.close(fd)
    image.save(path)
    return path


def synthetic_cv_image_pdf_path(lines):
    """The same synthetic CV image, wrapped in a PDF with no text layer at
    all — exercises the per-page OCR fallback in extract_text_from_pdf."""
    image = synthetic_cv_image(lines).convert("RGB")
    fd, path = tempfile.mkstemp(suffix=".pdf")
    os.close(fd)
    image.save(path, "PDF")
    return path


SYNTHETIC_CV_LINES = [
    "Jane Doe",
    "Data Analyst",
    "",
    "Summary",
    "Experienced data analyst with 3 years of experience.",
    "",
    "Experience",
    "Data Analyst, Acme Corp, Jan 2022 - Present",
    "Built dashboards using Power BI and Excel.",
    "",
    "Skills",
    "Python, SQL, Power BI, Excel",
]
