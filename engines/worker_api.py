"""FastAPI worker service for CYBERCORE Prediction Engine & CyberGym Clean Lab."""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Optional

from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel

from engines.cybergym.lab_studio import CyberGymLab
from engines.prediction.ensemble import PredictionEngine

# Structured JSON logging
logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("cybercore-worker")


def log_json(event: str, **kwargs: object) -> None:
    logger.info(json.dumps({"event": event, "ts": time.time(), **kwargs}))


app = FastAPI(title="CYBERCORE Worker API", version="1.0.0")
prediction_engine = PredictionEngine()
cybergym_lab = CyberGymLab()

METRICS = {
    "predict_requests_total": 0,
    "predict_errors_total": 0,
    "cybergym_requests_total": 0,
    "cybergym_errors_total": 0,
}


class PredictRequest(BaseModel):
    symbol: str = "BTC"
    days: int = 90
    horizon: int = 1


class CyberGymRequest(BaseModel):
    persona: str = "research_analyst"
    topic: str
    controlled_mode: bool = True


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": os.getenv("WORKER_ROLE", "unified-worker")}


@app.get("/ready")
def ready() -> dict:
    return {"status": "ready", "redis_url_configured": bool(os.getenv("REDIS_URL"))}


@app.get("/metrics")
def metrics() -> Response:
    lines = [f"cybercore_{k} {v}" for k, v in METRICS.items()]
    return Response(content="\n".join(lines) + "\n", media_type="text/plain")


@app.post("/predict")
def run_prediction(req: PredictRequest) -> dict:
    METRICS["predict_requests_total"] += 1
    start = time.time()
    try:
        result = prediction_engine.predict(
            symbol=req.symbol, days=req.days, horizon=req.horizon
        )
        log_json("predict_ok", symbol=req.symbol, duration_ms=round((time.time() - start) * 1000, 2))
        return result.to_dict()
    except Exception as exc:
        METRICS["predict_errors_total"] += 1
        log_json("predict_error", symbol=req.symbol, error=str(exc))
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/cybergym/run")
def run_cybergym(req: CyberGymRequest) -> dict:
    METRICS["cybergym_requests_total"] += 1
    start = time.time()
    try:
        result = cybergym_lab.run_session(
            persona=req.persona, topic=req.topic, controlled_mode=req.controlled_mode
        )
        log_json("cybergym_ok", persona=req.persona, duration_ms=round((time.time() - start) * 1000, 2))
        return result.to_dict()
    except ValueError as exc:
        METRICS["cybergym_errors_total"] += 1
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        METRICS["cybergym_errors_total"] += 1
        log_json("cybergym_error", persona=req.persona, error=str(exc))
        raise HTTPException(status_code=500, detail=str(exc)) from exc
