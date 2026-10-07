# AI Interview Coach

A Next.js frontend and FastAPI backend for the AI Interview Coach.

## Requirements

- Node.js 20.9 or newer
- Python 3.12

In local development, the frontend uses `http://localhost:8000` by default.
Deployments must set `NEXT_PUBLIC_API_BASE_URL` to the backend's public URL.

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
On startup, the backend prints whether Groq is configured and how many explicit
CORS origins are allowed (never the API key itself). Invalid requests receive
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

## Deploy

### Render backend

Create a **Web Service** from this repository with:

- **Root Directory:** `backend`
- **Runtime:** Python 3
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Health Check Path:** `/health`

Render uses `backend/.python-version` to select Python 3.12.15.

Add these Render environment variables:

- `GROQ_API_KEY`: your Groq API key
- `CORS_ORIGINS`: your deployed Vercel origin, for example
  `https://ai-interview-coach.vercel.app` (no trailing slash). Add any additional
  allowed frontend origins as a comma-separated list.

Render supplies `PORT`; the start command binds Uvicorn to that port.

### Vercel frontend

Import this repository as a Vercel project with **Root Directory** set to
`frontend`. Add this environment variable for Production (and Preview too, if
you want previews to call the same backend):

- `NEXT_PUBLIC_API_BASE_URL`: the Render service URL, for example
  `https://ai-interview-coach-api.onrender.com` (no trailing slash).

Redeploy after setting the variable. Update Render's `CORS_ORIGINS` with the
Vercel domain shown in the project settings, then redeploy the backend.
