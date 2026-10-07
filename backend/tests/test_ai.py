import json
import unittest
from contextlib import redirect_stdout
from io import StringIO
from types import SimpleNamespace
from unittest.mock import Mock, patch

import httpx
from fastapi.testclient import TestClient
from groq import APIConnectionError

from app import ai
from app.main import app


class AIApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)
        self.groq = Mock()
        self.patch_client = patch("app.ai.groq_client", self.groq)
        self.patch_client.start()
        self.addCleanup(self.patch_client.stop)

    def set_completion(self, response: dict[str, object]) -> None:
        self.groq.chat.completions.create.return_value = SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(content=json.dumps(response)),
                )
            ]
        )

    def test_interviewer_returns_a_question_and_uses_configured_model(self) -> None:
        self.set_completion(
            {"message": "How would you handle a cache miss?", "ended": False}
        )

        response = self.client.post(
            "/interview/next",
            json={"topic": "Caching", "difficulty": "Medium", "conversation": []},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {"message": "How would you handle a cache miss?", "ended": False},
        )
        self.assertEqual(self.groq.chat.completions.create.call_args.kwargs["model"], ai.MODEL)
        self.assertEqual(
            self.groq.chat.completions.create.call_args.kwargs["response_format"],
            {"type": "json_object"},
        )

    def test_interviewer_can_signal_that_the_interview_ended(self) -> None:
        self.set_completion(
            {"message": "Thanks for your time; that wraps up the interview.", "ended": True}
        )

        response = self.client.post(
            "/interview/next",
            json={"topic": "Caching", "difficulty": "Hard", "conversation": []},
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["ended"])

    def test_start_interview_asks_the_first_question(self) -> None:
        self.set_completion({"message": "What is a cache?", "ended": False})

        response = self.client.post(
            "/interview/start",
            json={"topic": "Caching", "difficulty": "Easy"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["message"], "What is a cache?")
        sent_messages = self.groq.chat.completions.create.call_args.kwargs["messages"]
        self.assertEqual(len(sent_messages), 1)
        self.assertEqual(sent_messages[0]["role"], "system")

    def test_submit_answer_includes_prior_conversation_and_new_answer(self) -> None:
        self.set_completion(
            {"message": "How would you invalidate a stale entry?", "ended": False}
        )

        response = self.client.post(
            "/interview/answer",
            json={
                "topic": "Caching",
                "difficulty": "Medium",
                "conversation": [
                    {"speaker": "interviewer", "message": "What is a cache?"},
                ],
                "answer": "A cache stores reusable data for faster access.",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["ended"])
        sent_messages = self.groq.chat.completions.create.call_args.kwargs["messages"]
        self.assertEqual(
            sent_messages[1:],
            [
                {"role": "assistant", "content": "What is a cache?"},
                {
                    "role": "user",
                    "content": "A cache stores reusable data for faster access.",
                },
            ],
        )

    def test_start_answer_and_report_complete_stateless_interview_flow(self) -> None:
        self.set_completion({"message": "What does a cache do?", "ended": False})
        start = self.client.post(
            "/interview/start",
            json={"topic": "Caching", "difficulty": "Easy"},
        )
        self.assertEqual(start.status_code, 200)
        conversation = [
            {"speaker": "interviewer", "message": start.json()["message"]}
        ]

        self.set_completion(
            {"message": "Thanks; that concludes the interview.", "ended": True}
        )
        answer = self.client.post(
            "/interview/answer",
            json={
                "topic": "Caching",
                "difficulty": "Easy",
                "conversation": conversation,
                "answer": "A cache stores reusable data for faster access.",
            },
        )
        self.assertEqual(answer.status_code, 200)
        self.assertTrue(answer.json()["ended"])
        conversation.extend(
            [
                {
                    "speaker": "candidate",
                    "message": "A cache stores reusable data for faster access.",
                },
                {"speaker": "interviewer", "message": answer.json()["message"]},
            ]
        )

        self.set_completion(
            {
                "score": 78,
                "strengths": [
                    {
                        "observation": "Recognized caching improves repeated access.",
                        "evidence": "A cache stores reusable data for faster access.",
                    }
                ],
                "weaknesses": [],
                "topics_to_revise": [],
            }
        )
        report = self.client.post(
            "/report",
            json={
                "topic": "Caching",
                "difficulty": "Easy",
                "conversation": conversation,
            },
        )
        self.assertEqual(report.status_code, 200)
        self.assertEqual(report.json()["score"], 78)
        self.assertEqual(report.json()["pass_fail"], "Pass")

    def test_localhost_frontend_origins_are_allowed(self) -> None:
        response = self.client.options(
            "/interview/start",
            headers={
                "Origin": "http://localhost:3001",
                "Access-Control-Request-Method": "POST",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers["access-control-allow-origin"],
            "http://localhost:3001",
        )

    def test_report_derives_verdict_and_pass_fail_from_score(self) -> None:
        self.set_completion(
            {
                "score": 70,
                "strengths": [
                    {
                        "observation": "Explained the cache key correctly.",
                        "evidence": "A cache key identifies the stored value.",
                    }
                ],
                "weaknesses": [],
                "topics_to_revise": ["Cache invalidation"],
            }
        )

        response = self.client.post(
            "/report",
            json={
                "topic": "Caching",
                "difficulty": "Medium",
                "conversation": [
                    {"speaker": "interviewer", "message": "What does a cache key do?"},
                    {
                        "speaker": "candidate",
                        "message": "A cache key identifies the stored value.",
                    },
                ],
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["overall_verdict"], "good")
        self.assertEqual(response.json()["pass_fail"], "Pass")

    def test_report_rejects_evidence_not_present_in_candidate_answer(self) -> None:
        self.set_completion(
            {
                "score": 90,
                "strengths": [
                    {
                        "observation": "Demonstrated strong distributed systems knowledge.",
                        "evidence": "I guarantee exactly once delivery.",
                    }
                ],
                "weaknesses": [],
                "topics_to_revise": [],
            }
        )

        response = self.client.post(
            "/report",
            json={
                "topic": "Messaging",
                "difficulty": "Hard",
                "conversation": [
                    {"speaker": "interviewer", "message": "Describe message delivery."},
                    {"speaker": "candidate", "message": "I use retries and idempotency keys."}
                ],
            },
        )

        self.assertEqual(response.status_code, 502)
        self.assertIn("evidence not found", response.json()["detail"])

    def test_ai_endpoints_require_a_groq_key(self) -> None:
        with patch("app.ai.groq_client", None):
            response = self.client.post(
                "/interview/next",
                json={"topic": "Python", "difficulty": "Easy", "conversation": []},
            )

        self.assertEqual(response.status_code, 503)

    def test_groq_connection_errors_return_a_gateway_error(self) -> None:
        self.groq.chat.completions.create.side_effect = APIConnectionError(
            request=httpx.Request("POST", "https://api.groq.com")
        )

        response = self.client.post(
            "/interview/next",
            json={"topic": "Python", "difficulty": "Easy", "conversation": []},
        )

        self.assertEqual(response.status_code, 502)

    def test_report_score_bands_and_pass_threshold(self) -> None:
        expected = [
            (84, "good", "Pass"),
            (85, "excellent", "Pass"),
            (69, "adequate", "Fail"),
            (55, "adequate", "Fail"),
            (54, "weak", "Fail"),
        ]
        request = {
            "topic": "Caching",
            "difficulty": "Medium",
            "conversation": [
                {"speaker": "interviewer", "message": "What is a cache?"},
                {"speaker": "candidate", "message": "A cache stores data for reuse."},
            ],
        }
        for score, verdict, result in expected:
            with self.subTest(score=score):
                self.set_completion(
                    {
                        "score": score,
                        "strengths": [],
                        "weaknesses": [],
                        "topics_to_revise": [],
                    }
                )
                response = self.client.post("/report", json=request)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["overall_verdict"], verdict)
                self.assertEqual(response.json()["pass_fail"], result)

    def test_invalid_input_returns_friendly_validation_message(self) -> None:
        response = self.client.post(
            "/interview/start",
            json={"topic": " ", "difficulty": "Expert"},
        )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(
            response.json()["detail"],
            "Topic cannot be empty. Choose a difficulty: Easy, Medium, or Hard.",
        )

    def test_invalid_json_returns_friendly_message(self) -> None:
        response = self.client.post(
            "/interview/start",
            content="{not json",
            headers={"Content-Type": "application/json"},
        )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"], "Request body must be valid JSON.")

    def test_unknown_request_fields_are_rejected_clearly(self) -> None:
        response = self.client.post(
            "/interview/start",
            json={
                "topic": "Caching",
                "difficulty": "Easy",
                "unexpected": True,
            },
        )

        self.assertEqual(response.status_code, 422)
        self.assertIn("unexpected field 'unexpected'", response.json()["detail"])

    def test_report_rejects_non_alternating_transcript(self) -> None:
        response = self.client.post(
            "/report",
            json={
                "topic": "Caching",
                "difficulty": "Easy",
                "conversation": [
                    {"speaker": "interviewer", "message": "What is a cache?"},
                    {"speaker": "candidate", "message": "A cache stores reusable data."},
                    {"speaker": "candidate", "message": "It can improve response times."},
                ],
            },
        )

        self.assertEqual(response.status_code, 422)
        self.assertIn("must alternate", response.json()["detail"])

    def test_startup_prints_service_status_without_secrets(self) -> None:
        output = StringIO()
        with redirect_stdout(output), TestClient(app):
            pass

        self.assertIn("AI Interview Coach API is ready", output.getvalue())
        self.assertIn("http://127.0.0.1:8000/docs", output.getvalue())


if __name__ == "__main__":
    unittest.main()
