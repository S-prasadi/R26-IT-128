"""
Component 2 — Career Pathway Predictor Dashboard

Run:
    python dashboard.py

Then open  http://localhost:8002
"""

import json
import sys
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).parent))
from train_all import CareerPathwayModel, predict_career_paths

app = FastAPI(title="Career Pathway Predictor")
model: CareerPathwayModel | None = None

STATIC_DIR = Path(__file__).parent / "static"
MODEL_INFO_PATH = Path(__file__).parent / "saved_models" / "model_info.json"


@app.on_event("startup")
async def load_model():
    global model
    print("Loading Career Pathway model ...")
    model = CareerPathwayModel.load()
    print("Model ready.")


app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
async def root():
    return FileResponse(STATIC_DIR / "index.html")


class PredictRequest(BaseModel):
    skills: list[str]
    current_role: str = "Student"
    experience_months: int = 0
    num_projects: int = 0
    top_k: int = 3


@app.post("/predict")
async def predict(req: PredictRequest):
    if model is None:
        return JSONResponse({"error": "Model not loaded"}, status_code=503)
    results = predict_career_paths(
        model=model,
        skills=req.skills,
        current_role=req.current_role,
        experience_months=req.experience_months,
        num_projects=req.num_projects,
        top_k=req.top_k,
    )
    return {"paths": results}


@app.get("/model-info")
async def model_info():
    with open(MODEL_INFO_PATH) as f:
        return json.load(f)


if __name__ == "__main__":
    uvicorn.run("dashboard:app", host="0.0.0.0", port=8002, reload=False)
