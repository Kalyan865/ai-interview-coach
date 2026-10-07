import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.ai import generate_report, groq_client, next_interview_turn
from app.schemas import (
    InterviewRequest,
    InterviewStartRequest,
    InterviewTurn,
    ReportRequest,
    ReportResponse,
    Speaker,
    SubmitAnswerRequest,
    TranscriptMessage,
)

def _parse_cors_origins(value: str) -> list[str]:
    origins = (origin.strip().rstrip("/") for origin in value.split(","))
    return list(dict.fromkeys(origin for origin in origins if origin))


cors_origins = _parse_cors_origins(os.getenv("CORS_ORIGINS", ""))


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    groq_status = "configured" if groq_client is not None else "not configured"
    print(
        f"AI Interview Coach API started (Groq {groq_status}; "
        f"{len(cors_origins)} configured CORS origin(s)).",
        flush=True,
    )
    yield


app = FastAPI(title="AI Interview Coach API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def request_validation_error_handler(
    _: Request,
    error: RequestValidationError,
) -> JSONResponse:
    messages = list(dict.fromkeys(_friendly_validation_message(item) for item in error.errors()))
    return JSONResponse(status_code=422, content={"detail": " ".join(messages)})


@app.get("/health")
def health_check() -> dict[str, str | bool]:
    return {
        "status": "ok",
        "groq_configured": groq_client is not None,
    }


@app.post("/interview/next", response_model=InterviewTurn)
def get_next_interview_turn(request: InterviewRequest) -> InterviewTurn:
    return next_interview_turn(request)


@app.post("/interview/start", response_model=InterviewTurn)
def start_interview(request: InterviewStartRequest) -> InterviewTurn:
    return next_interview_turn(
        InterviewRequest(topic=request.topic, difficulty=request.difficulty)
    )


@app.post("/interview/answer", response_model=InterviewTurn)
def submit_answer(request: SubmitAnswerRequest) -> InterviewTurn:
    conversation = [
        *request.conversation,
        TranscriptMessage(speaker=Speaker.CANDIDATE, message=request.answer),
    ]
    return next_interview_turn(
        InterviewRequest(
            topic=request.topic,
            difficulty=request.difficulty,
            conversation=conversation,
        )
    )


@app.post("/report", response_model=ReportResponse)
def get_interview_report(request: ReportRequest) -> ReportResponse:
    return generate_report(request)


def _friendly_validation_message(error: dict[str, object]) -> str:
    location = error.get("loc", ())
    field = str(location[-1]) if isinstance(location, (list, tuple)) and location else ""
    error_type = str(error.get("type", ""))

    if error_type in {"json_invalid", "value_error.jsondecode"}:
        return "Request body must be valid JSON."
    if error_type == "extra_forbidden":
        return f"Remove the unexpected field '{field}' and try again."
    if field == "body" and error_type == "model_attributes_type":
        return "Request body must be a JSON object."

    if field == "topic":
        if error_type == "missing":
            return "A topic is required."
        if error_type == "string_too_short":
            return "Topic cannot be empty."
        if error_type == "string_too_long":
            return "Topic must be 200 characters or fewer."
        return "Topic must be text."
    if field == "difficulty":
        return "Choose a difficulty: Easy, Medium, or Hard."
    if field == "answer":
        if error_type == "missing":
            return "An answer is required."
        if error_type == "string_too_long":
            return "Answers must be 8,000 characters or fewer."
        if error_type == "string_too_short":
            return "Answer cannot be empty."
        return "Answer must be text."
    if field == "conversation":
        if error_type == "missing":
            return "Provide the conversation so far."
        if error_type == "too_short":
            return "The conversation must include at least one message."
        if error_type == "too_long":
            return "The conversation is too long. Start a new interview to continue."
    if field == "message":
        if error_type == "missing":
            return "Every conversation message must include its text."
        if error_type == "string_too_long":
            return "Each conversation message must be 8,000 characters or fewer."
        if error_type == "string_too_short":
            return "Every conversation message must include non-empty text."
        return "Every conversation message must be text."
    if field == "speaker":
        return "Each message speaker must be interviewer or candidate."

    detail = str(error.get("msg", "")).removeprefix("Value error, ").strip()
    return detail or "The request is invalid. Check the fields and try again."
