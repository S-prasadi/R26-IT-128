import functools
import os
import re
import ssl
import tempfile
from urllib.error import URLError

import numpy as np
from PIL import Image, ImageOps


class OCRError(Exception):
    """Raised when an image cannot be OCR'd."""
    pass


_HEADING_KEYWORDS = ("experience", "education", "skills", "projects", "summary", "profile")


def text_quality(text):
    """Score extracted text usefulness on a 0-100 scale.

    Weighted: 45% printable-character ratio, 35% alphabetic word-token count
    (capped at 250), 20% CV section-heading keyword hits (capped at 4). Used
    both to compare pypdf's extraction modes and to decide whether a PDF
    page's text layer is good enough to skip OCR.
    """
    text = (text or "").strip()
    if not text:
        return 0.0

    chars = len(text)
    printable = sum(ch.isalnum() or ch.isspace() or ch in "@.,:/+#&()-•" for ch in text) / chars

    words = re.findall(r"[A-Za-z][A-Za-z0-9+#.\-]{1,}", text)
    alpha_words = sum(any(c.isalpha() for c in word) for word in words)

    headings = sum(bool(re.search(rf"\b{h}\b", text, re.I)) for h in _HEADING_KEYWORDS)

    return round(printable * 45 + min(alpha_words, 250) / 250 * 35 + min(headings, 4) / 4 * 20, 2)


def _clean_ocr_text(text):
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _configure_ssl_ca_bundle():
    """Point Python's default SSL context at certifi's CA bundle.

    Some environments ship a broken/incomplete system cert store, which
    breaks EasyOCR's first-run model download (an HTTPS request). Retried
    once, only on that specific failure — see _get_ocr_reader.
    """
    try:
        import certifi
        os.environ.setdefault("SSL_CERT_FILE", certifi.where())
        os.environ.setdefault("REQUESTS_CA_BUNDLE", certifi.where())
        ssl._create_default_https_context = ssl.create_default_context
    except Exception:
        pass


# CUDA-only in EasyOCR — leave off (default) on a machine without an NVIDIA
# GPU (e.g. this one, Apple Silicon). Only set OCR_USE_GPU=true on a CUDA box.
_USE_GPU = os.environ.get("OCR_USE_GPU", "false").lower() == "true"


@functools.lru_cache(maxsize=1)
def _get_ocr_reader():
    """Lazily construct the EasyOCR reader once and cache it for the process
    lifetime. Import of `easyocr` (and its heavy torch dependency) is deferred
    to here so modules that only need `text_quality`/text extraction don't
    pay that startup cost."""
    import easyocr

    try:
        return easyocr.Reader(["en"], gpu=_USE_GPU)
    except URLError as exc:
        reason = getattr(exc, "reason", None)
        if isinstance(reason, ssl.SSLCertVerificationError):
            _configure_ssl_ca_bundle()
            return easyocr.Reader(["en"], gpu=_USE_GPU)
        raise


def warm_up():
    """Force the EasyOCR reader to load into memory now, instead of on the
    first real request. Best-effort: a failure here just means the first
    real request pays the cold-load cost instead of a crash."""
    try:
        _get_ocr_reader()
    except Exception:
        pass


def _prepare_ocr_variants(image):
    """Build a few preprocessed variants of an image; OCR tries each and
    keeps whichever scores best. Handles low-contrast scans and photos of
    printed pages better than a single pass would."""
    import cv2

    image = ImageOps.exif_transpose(image).convert("RGB")

    width, height = image.size
    target_width = min(2600, max(1600, width))
    if width < target_width:
        scale = target_width / max(1, width)
        image = image.resize((target_width, int(height * scale)), Image.Resampling.LANCZOS)

    rgb = np.array(image)
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    denoised = cv2.fastNlMeansDenoising(gray, None, 8, 7, 21)
    contrast = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(denoised)
    adaptive = cv2.adaptiveThreshold(
        contrast, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 12
    )

    return [
        ("original", image),
        ("contrast", Image.fromarray(contrast)),
        ("adaptive", Image.fromarray(adaptive)),
    ]


def _order_ocr_results(results):
    """Reconstruct left-to-right, top-to-bottom reading order from EasyOCR's
    (bbox, text, confidence) tuples, with simple two-column detection."""
    if not results:
        return "", 0.0

    items = []
    for bbox, text, confidence in results:
        xs = [point[0] for point in bbox]
        ys = [point[1] for point in bbox]
        items.append({
            "text": text,
            "confidence": confidence,
            "x": min(xs),
            "y": (min(ys) + max(ys)) / 2,
            "height": max(ys) - min(ys) or 1,
        })

    xs_sorted = sorted(item["x"] for item in items)
    midpoint = xs_sorted[len(xs_sorted) // 2]
    left = [i for i in items if i["x"] < midpoint]
    right = [i for i in items if i["x"] >= midpoint]
    columns = [left, right] if len(left) >= 4 and len(right) >= 4 else [items]

    lines_out = []
    for column in columns:
        row_height = sum(i["height"] for i in column) / len(column)
        column_sorted = sorted(column, key=lambda i: (round(i["y"] / row_height), i["x"]))

        current_row, current_key = [], None
        for item in column_sorted:
            row_key = round(item["y"] / row_height)
            if current_key is not None and row_key != current_key:
                lines_out.append(" ".join(i["text"] for i in current_row))
                current_row = []
            current_row.append(item)
            current_key = row_key
        if current_row:
            lines_out.append(" ".join(i["text"] for i in current_row))

    avg_confidence = sum(i["confidence"] for i in items) / len(items)
    return "\n".join(lines_out), avg_confidence


def ocr_image(image):
    """OCR a PIL image, trying a few preprocessing variants and keeping
    whichever scores best. Returns (text, metadata) where metadata has
    method/confidence/quality/characters."""
    reader = _get_ocr_reader()
    candidates = []

    for variant_name, variant in _prepare_ocr_variants(image):
        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                tmp_path = tmp.name
                variant.save(tmp_path)
            results = reader.readtext(
                tmp_path,
                detail=1,
                paragraph=False,
                rotation_info=[90, 180, 270],
                decoder="beamsearch",
                beamWidth=5,
                contrast_ths=0.05,
                adjust_contrast=0.7,
                text_threshold=0.55,
                low_text=0.3,
            )
            text, confidence = _order_ocr_results(results)
            cleaned = _clean_ocr_text(text)
            score = text_quality(cleaned) * 0.8 + confidence * 20
            candidates.append((score, cleaned, variant_name, confidence))
        except Exception:
            continue
        finally:
            if tmp_path:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass

    if not candidates:
        raise OCRError("OCR failed on every image variant")

    _score, text, variant, confidence = max(candidates, key=lambda c: c[0])
    metadata = {
        "method": f"easyocr-{variant}",
        "confidence": round(confidence, 3),
        "quality": round(text_quality(text), 2),
        "characters": len(text),
    }
    return text, metadata


def extract_text_from_image(file_path):
    """OCR a standalone image file (PNG/JPG). Raises OCRError on failure."""
    try:
        with Image.open(file_path) as image:
            image.load()
            text, _metadata = ocr_image(image)
        return text
    except OCRError:
        raise
    except Exception as error:
        raise OCRError(f"Could not read image file: {error}") from error
