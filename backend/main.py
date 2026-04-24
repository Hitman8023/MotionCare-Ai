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

API_KEY = (os.getenv("GEMINI_API_KEY") or os.getenv("VITE_GEMINI_API_KEY") or "").strip()
DEFAULT_MODEL = (os.getenv("GEMINI_MODEL") or os.getenv("VITE_LLM_MODEL") or "gemini-2.5-flash").strip()

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


class DietMealLog(BaseModel):
    completed: bool = False
    extras: str = ""


class DietLogEntry(BaseModel):
    date: str
    meals: dict


class DietMetricsRequest(BaseModel):
    logs: list[DietLogEntry] = Field(default_factory=list)


class DietMetricsResponse(BaseModel):
    adherenceScore: int
    junkCount: int
    weeklyConsistency: int


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
        error_text = str(exc)
        if "API_KEY_INVALID" in error_text or "API key not valid" in error_text:
            raise HTTPException(
                status_code=401,
                detail="Gemini API key is invalid. Update GEMINI_API_KEY in backend/.env or root .env.local.",
            ) from exc

        raise HTTPException(status_code=500, detail=f"Gemini request failed: {error_text}") from exc


def _is_junk_like(text: str) -> bool:
    token = text.lower()
    junk_keywords = [
        "junk",
        "burger",
        "pizza",
        "fries",
        "fried",
        "soda",
        "chips",
        "ice cream",
        "pastry",
        "sweet",
    ]
    return any(word in token for word in junk_keywords)


@app.post("/api/diet/metrics", response_model=DietMetricsResponse)
def compute_diet_metrics(payload: DietMetricsRequest) -> DietMetricsResponse:
    logs = payload.logs[-7:]

    if not logs:
        return DietMetricsResponse(adherenceScore=0, junkCount=0, weeklyConsistency=0)

    total_meals = 0
    completed_meals = 0
    junk_count = 0
    completion_rates: list[float] = []

    for entry in logs:
        meals = entry.meals or {}
        entry_total = 0
        entry_completed = 0

        for meal_name in ["breakfast", "lunch", "dinner", "snacks"]:
            raw = meals.get(meal_name)
            meal = DietMealLog(**raw) if isinstance(raw, dict) else DietMealLog()

            entry_total += 1
            total_meals += 1

            if meal.completed:
                entry_completed += 1
                completed_meals += 1

            if meal.extras.strip():
                junk_count += 1
                if _is_junk_like(meal.extras):
                    junk_count += 1

        if entry_total > 0:
            completion_rates.append(entry_completed / entry_total)

    adherence = round((completed_meals / total_meals) * 100) if total_meals > 0 else 0

    if completion_rates:
        avg = sum(completion_rates) / len(completion_rates)
        variance = sum((rate - avg) ** 2 for rate in completion_rates) / len(completion_rates)
        consistency = round(max(0, min(100, (1 - variance * 4) * 100)))
    else:
        consistency = 0

    return DietMetricsResponse(
        adherenceScore=max(0, min(100, adherence)),
        junkCount=max(0, junk_count),
        weeklyConsistency=max(0, min(100, consistency)),
    )


# Run with:
# uvicorn backend.main:app --reload --port 8000
