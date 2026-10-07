from enum import Enum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

MAX_TRANSCRIPT_CHARS = 40_000


class Difficulty(str, Enum):
    EASY = "Easy"
    MEDIUM = "Medium"
    HARD = "Hard"


class Speaker(str, Enum):
    INTERVIEWER = "interviewer"
    CANDIDATE = "candidate"


class TranscriptMessage(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    speaker: Speaker
    message: Annotated[str, Field(min_length=1, max_length=8_000)]


class InterviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    topic: Annotated[str, Field(min_length=1, max_length=200)]
    difficulty: Difficulty
    conversation: list[TranscriptMessage] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def validate_transcript_size(self) -> "InterviewRequest":
        _ensure_transcript_size(self.conversation)
        _validate_conversation_order(self.conversation)
        return self


class InterviewStartRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    topic: Annotated[str, Field(min_length=1, max_length=200)]
    difficulty: Difficulty


class SubmitAnswerRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    topic: Annotated[str, Field(min_length=1, max_length=200)]
    difficulty: Difficulty
    conversation: Annotated[list[TranscriptMessage], Field(min_length=1, max_length=98)]
    answer: Annotated[str, Field(min_length=1, max_length=8_000)]

    @model_validator(mode="after")
    def validate_answer_turn(self) -> "SubmitAnswerRequest":
        _validate_conversation_order(self.conversation)
        if self.conversation[-1].speaker != Speaker.INTERVIEWER:
            raise ValueError("The conversation must end with an interviewer question.")
        transcript = [
            *self.conversation,
            TranscriptMessage(speaker=Speaker.CANDIDATE, message=self.answer),
        ]
        _ensure_transcript_size(transcript)
        return self


class InterviewTurn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    message: Annotated[str, Field(min_length=1, max_length=2_000)]
    ended: bool

    @model_validator(mode="after")
    def validate_turn_format(self) -> "InterviewTurn":
        question_marks = self.message.count("?")
        if self.ended and question_marks:
            raise ValueError("An ending message must not contain a question.")
        if not self.ended and question_marks != 1:
            raise ValueError("An active interviewer turn must contain exactly one question.")
        return self


class ReportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    topic: Annotated[str, Field(min_length=1, max_length=200)]
    difficulty: Difficulty
    conversation: Annotated[list[TranscriptMessage], Field(min_length=1, max_length=100)]

    @model_validator(mode="after")
    def validate_report_transcript(self) -> "ReportRequest":
        _ensure_transcript_size(self.conversation)
        _validate_conversation_order(self.conversation)
        if not any(message.speaker == Speaker.CANDIDATE for message in self.conversation):
            raise ValueError("The conversation must include at least one candidate answer.")
        return self


EvidenceText = Annotated[str, Field(min_length=8, max_length=300)]
ReportText = Annotated[str, Field(min_length=1, max_length=500)]


class EvidenceItem(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    observation: ReportText
    evidence: EvidenceText


class GeneratedReport(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    score: int = Field(ge=0, le=100, strict=True)
    strengths: list[EvidenceItem] = Field(max_length=8)
    weaknesses: list[EvidenceItem] = Field(max_length=8)
    topics_to_revise: list[ReportText] = Field(max_length=8)


class ReportResponse(GeneratedReport):
    overall_verdict: Literal["excellent", "good", "adequate", "weak"]
    pass_fail: Literal["Pass", "Fail"]


def _ensure_transcript_size(conversation: list[TranscriptMessage]) -> None:
    if sum(len(message.message) for message in conversation) > MAX_TRANSCRIPT_CHARS:
        raise ValueError(f"The conversation must not exceed {MAX_TRANSCRIPT_CHARS} characters.")


def _validate_conversation_order(conversation: list[TranscriptMessage]) -> None:
    if conversation and conversation[0].speaker != Speaker.INTERVIEWER:
        raise ValueError("The conversation must start with an interviewer message.")
    for previous, current in zip(conversation, conversation[1:]):
        if previous.speaker == current.speaker:
            raise ValueError("Interviewer and candidate messages must alternate.")
