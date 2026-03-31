import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from google import genai


BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent

# Prefer backend/.env, then allow root .env/.env.local for shared local setups.
load_dotenv(BACKEND_DIR / ".env")
load_dotenv(PROJECT_ROOT / ".env")
load_dotenv(PROJECT_ROOT / ".env.local")

API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("VITE_GEMINI_API_KEY")
DEFAULT_MODEL = os.getenv("GEMINI_MODEL") or os.getenv("VITE_LLM_MODEL") or "gemini-2.5-flash"

if not API_KEY:
    raise RuntimeError("GEMINI_API_KEY is missing. Add it to backend/.env or environment variables.")

client = genai.Client(api_key=API_KEY)

app = FastAPI(title="MotionCare Gemini API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=8000)
    model: Optional[str] = None


class GenerateResponse(BaseModel):
    model: str
    answer: str


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/llm/generate", response_model=GenerateResponse)
def generate_text(payload: GenerateRequest) -> GenerateResponse:
    model_name = payload.model or DEFAULT_MODEL

    try:
        response = client.models.generate_content(
            model=model_name,
            contents=payload.prompt,
        )
        answer = (response.text or "").strip()

        if not answer:
            raise HTTPException(status_code=502, detail="Empty response from Gemini")

        return GenerateResponse(model=model_name, answer=answer)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Gemini request failed: {exc}") from exc


# Run with:
# uvicorn backend.main:app --reload --port 8000
