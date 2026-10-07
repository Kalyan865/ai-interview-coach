# AI Interview Coach

A Next.js frontend and FastAPI backend for the AI Interview Coach.

## Requirements

- Node.js 20.9 or newer
- Python 3.12

The frontend calls `http://localhost:8000` by default. To use a different API
address, set `NEXT_PUBLIC_API_BASE_URL` in `frontend/.env.local`.

## Install

From the project root:

```bash
cd frontend
npm install
cd ../backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Add your Groq API key to `backend/.env` as `GROQ_API_KEY=...`. The AI endpoints
require this key and use Groq's `openai/gpt-oss-120b` model.

## AI backend endpoints

- `POST /interview/start` accepts `topic` and `difficulty` (`Easy`, `Medium`,
  or `Hard`) and returns the first `message` plus an `ended` flag.
- `POST /interview/answer` accepts `topic`, `difficulty`, the prior
  `conversation`, and the new `answer`. Send the full transcript so far; it must
  end with the interviewer question being answered. The response contains the
  next interviewer `message` and `ended`. The frontend appends the answer and
  returned message to its transcript.
- `POST /report` accepts `topic`, `difficulty`, and the full `conversation`
  (messages with `speaker` set to `interviewer` or `candidate`). It returns a
  structured score, evidence-backed strengths and weaknesses, revision topics,
  an `overall_verdict`, and `pass_fail`. Scores of 70 or above pass. Verdict
  bands are excellent (85+), good (70-84), adequate (55-69), and weak (below
  55).

The backend stores no interview state. `GET /health` reports whether the API
is running and whether Groq is configured. CORS allows `localhost` and
`127.0.0.1` frontend origins on any port.

Interactive API docs are available at http://localhost:8000/docs.
On startup, the backend prints its local API address, docs URL, and whether a
Groq API key is configured (never the key itself). Invalid requests receive
clear 422 validation details.

## Run

Start the backend in one terminal, from the project root:

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload
```

Start the frontend in another terminal, from the project root:

```bash
cd frontend
npm run dev
```

Open http://localhost:3000. The backend health endpoint is available at
http://localhost:8000/health.
