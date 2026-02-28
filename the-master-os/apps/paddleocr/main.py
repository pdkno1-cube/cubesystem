"""PaddleOCR HTTP Service — FastAPI wrapper for PaddleOCR.

Exposes endpoints that match the PaddleOCRClient contract in apps/api:
  GET  /health            -> {"status": "ok"}
  POST /predict/ocr       -> {"text": ..., "regions": [...], "confidence": ...}
  POST /predict/structure  -> {"fields": {...}, "confidence": ...}

Accepts JSON payloads with either:
  - {"image_url": "https://..."} — downloads the image first
  - {"image_base64": "..."} — decodes base64 image data
"""

from __future__ import annotations

import base64
import logging
import os
import tempfile
from typing import Optional

import httpx
import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException
from paddleocr import PaddleOCR
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="PaddleOCR Service", version="1.0.0")

# ---------------------------------------------------------------------------
# Lazy-load OCR engine (heavy; ~1GB model download on first use)
# ---------------------------------------------------------------------------
_ocr_engines: dict[str, PaddleOCR] = {}


def _get_engine(lang: str = "korean") -> PaddleOCR:
    """Return (or create) a PaddleOCR engine for the given language."""
    if lang not in _ocr_engines:
        logger.info("Initialising PaddleOCR engine for lang=%s ...", lang)
        _ocr_engines[lang] = PaddleOCR(use_angle_cls=True, lang=lang, show_log=False)
        logger.info("PaddleOCR engine ready for lang=%s", lang)
    return _ocr_engines[lang]


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class OCRRequest(BaseModel):
    image_url: Optional[str] = None
    image_base64: Optional[str] = None
    language: str = "korean"


class StructureRequest(OCRRequest):
    template: Optional[str] = None


class OCRRegion(BaseModel):
    bbox: list[list[float]]
    text: str
    confidence: float


class OCRResponse(BaseModel):
    text: str
    regions: list[OCRRegion]
    confidence: float


class StructureResponse(BaseModel):
    fields: dict[str, str]
    confidence: float


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _resolve_image(req: OCRRequest) -> str:
    """Download or decode the image and return a temp file path."""
    if not req.image_url and not req.image_base64:
        raise HTTPException(
            status_code=400,
            detail="Provide either 'image_url' or 'image_base64'.",
        )

    if req.image_url:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(req.image_url)
            if resp.status_code >= 400:
                raise HTTPException(
                    status_code=400,
                    detail=f"Failed to download image: HTTP {resp.status_code}",
                )
            data = resp.content
    else:
        try:
            data = base64.b64decode(req.image_base64)  # type: ignore[arg-type]
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid base64 data: {exc}",
            ) from exc

    suffix = ".png"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
        f.write(data)
        return f.name


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/predict/ocr", response_model=OCRResponse)
async def predict_ocr(req: OCRRequest) -> OCRResponse:
    """Run full OCR on the provided image."""
    temp_path = await _resolve_image(req)
    try:
        engine = _get_engine(req.language)
        result = engine.ocr(temp_path, cls=True)

        regions: list[OCRRegion] = []
        all_text_parts: list[str] = []
        confidences: list[float] = []

        if result and result[0]:
            for line in result[0]:
                bbox = [[float(coord) for coord in pt] for pt in line[0]]
                text = str(line[1][0])
                conf = float(line[1][1])
                regions.append(OCRRegion(bbox=bbox, text=text, confidence=conf))
                all_text_parts.append(text)
                confidences.append(conf)

        avg_confidence = float(np.mean(confidences)) if confidences else 0.0
        full_text = "\n".join(all_text_parts)

        return OCRResponse(
            text=full_text,
            regions=regions,
            confidence=avg_confidence,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("OCR prediction failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        os.unlink(temp_path)


@app.post("/predict/structure", response_model=StructureResponse)
async def predict_structure(req: StructureRequest) -> StructureResponse:
    """Extract structured key-value pairs from a document image.

    Uses OCR first, then applies simple heuristics to extract
    key: value pairs from the recognised text.  If a ``template``
    is provided, only those keys are returned.
    """
    temp_path = await _resolve_image(req)
    try:
        engine = _get_engine(req.language)
        result = engine.ocr(temp_path, cls=True)

        all_text_parts: list[str] = []
        confidences: list[float] = []

        if result and result[0]:
            for line in result[0]:
                text = str(line[1][0])
                conf = float(line[1][1])
                all_text_parts.append(text)
                confidences.append(conf)

        avg_confidence = float(np.mean(confidences)) if confidences else 0.0

        # Simple key-value extraction: split on common delimiters
        fields: dict[str, str] = {}
        for text_line in all_text_parts:
            for sep in [":", "=", " - "]:
                if sep in text_line:
                    parts = text_line.split(sep, 1)
                    key = parts[0].strip()
                    val = parts[1].strip() if len(parts) > 1 else ""
                    if key:
                        fields[key] = val
                    break

        # Filter to template keys if provided
        if req.template:
            template_keys = [k.strip() for k in req.template.split(",")]
            fields = {k: v for k, v in fields.items() if k in template_keys}

        return StructureResponse(fields=fields, confidence=avg_confidence)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Structure prediction failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        os.unlink(temp_path)


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8866"))
    uvicorn.run(app, host="0.0.0.0", port=port)
