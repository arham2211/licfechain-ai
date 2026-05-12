# LifeChain AI

LifeChain AI is a full-stack healthcare platform for longitudinal patient record management, clinician workflows, laboratory reporting, family-history analysis, and AI-assisted disease monitoring.

The system combines a FastAPI backend, a Next.js frontend, PostgreSQL-backed persistence, and multiple machine learning pipelines for structured lab inference and oral cancer image screening. It is designed around a unified patient record that can be used by patients, doctors, labs, and administrators through role-based access.

## Highlights

- Unified patient records with a unique patient identity across visits, reports, diagnoses, and prescriptions
- Role-based portals for admin, doctor, patient, and lab users
- Doctor visit workflows with symptoms, diagnoses, and prescriptions
- Lab workflows for report creation, test result entry, and report completion
- Family relationship graphing and family disease history analysis
- Multi-disease progression reporting for diabetes, CKD, anemia, parathyroid disorders, and oral cancer
- AI-assisted oral cancer screening with image upload and progression tracking
- Translation utilities and proposal placeholder adapters for OCR and dental flows
- Admin-assisted onboarding for patients, doctors, and labs

## Tech Stack

### Backend

- FastAPI
- SQLAlchemy 2.x with async sessions
- PostgreSQL via `asyncpg` and `psycopg2`
- Alembic for migrations
- JWT-based authentication and role checks
- ML/AI libraries including TensorFlow, PyTorch, XGBoost, scikit-learn, Groq, and Google GenAI integrations

### Frontend

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS v4
- Framer Motion
- Lucide React
- Recharts

### Dev Runtime

- Docker and Docker Compose for local development
- Separate backend and frontend dev containers

## Repository Structure

```text
.
├── app/                  # FastAPI application code
│   ├── api/v1/           # API routers and endpoint modules
│   ├── core/             # config, reference ranges, shared utilities
│   ├── db/               # database session setup
│   ├── models/           # SQLAlchemy models
│   ├── schemas/          # Pydantic schemas
│   └── services/         # inference, reporting, oral cancer, auth, email services
├── frontend/             # Next.js application
├── migrations/           # Alembic migrations
├── model_training/       # training, inference, and model test scripts
├── models/               # trained model artifacts and configs
├── docs/                 # supporting project docs
├── tests/                # backend tests
├── Dockerfile            # production-style combined image build
├── docker-compose.dev.yml
├── requirements.txt
└── start.sh
```

## Core Modules

### Clinical and Record Management

- `patients`: patient creation, profile access, family links, and family disease history
- `doctors`: doctor registration and specialization management
- `visits`: doctor visits, symptoms, diagnoses, and prescriptions
- `labs`: labs, reports, test results, completion workflows, and oral scan-linked report flows

### AI and Reporting

- `unified_inference`: structured disease inference endpoints
- `progression_report`: timelines, predictions, and progression summaries
- `oral_cancer`: image-based oral lesion detection and saved screening results
- `translation`: translation utilities for multilingual workflows

## Authentication and Roles

Authentication is handled through JWT-based endpoints under `/api/v1/auth`.

Supported roles:

- `admin`
- `doctor`
- `patient`
- `lab`

Backend routers enforce role-based access with dependency guards. The frontend also applies role-specific navigation and workflow visibility.

## Local Development

### Prerequisites

- Docker Desktop
- A running PostgreSQL instance reachable from Docker at `host.docker.internal:5433`
- A populated `.env` file

### Start with Docker Compose

```bash
docker compose -f docker-compose.dev.yml up --build
```

Services started:

- Backend: `http://localhost:8000`
- Frontend: `http://localhost:3000`
- OpenAPI docs: `http://localhost:8000/docs`

The backend container runs:

```bash
alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The frontend container runs:

```bash
npm install && npm run dev -- --webpack -H 0.0.0.0 -p 3000
```

## Running Without Docker

### Backend

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Environment Variables

The backend reads configuration from `.env` using `pydantic-settings`.

Key variables:

- `DATABASE_URL`
- `DIRECT_DATABASE_URL`
- `SECRET_KEY`
- `GOOGLE_API_KEY`
- `GROQ_API_KEY`
- `ROBOFLOW_API_KEY`
- `ROBOFLOW_ORAL_MODEL_ID`
- `ROBOFLOW_ORAL_MODEL_VERSION`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `NOTIFICATION_EMAIL`

Frontend runtime uses:

- `NEXT_PUBLIC_API_BASE_URL`

## Email and Credential Delivery

The project includes an SMTP-backed email service used to send newly created doctor and lab credentials to the configured notification address.

For Gmail SMTP, use an App Password rather than the normal account password.

## Testing

### Backend smoke test

```bash
pytest tests/test_health.py
```

### Model testing script

```bash
python model_training/test_models.py
```

Note: model testing depends on generated datasets and trained artifacts being present.

## API Surface

Primary API groups under `/api/v1`:

- `/auth`
- `/health`
- `/patients`
- `/doctors`
- `/visits`
- `/labs`
- `/ml`
- `/ml/oral-cancer`
- `/reports`
- `/proposal`
- `/translation`

## Current Product Direction

This repository currently emphasizes:

- chronic disease monitoring from structured lab data
- oral cancer screening from uploaded images
- report-to-diagnosis/progression workflows
- family-linked health context
- multilingual, role-based clinical dashboards

## Notes

- The root `LifeChain.txt` now contains a concise project brief instead of the original proposal text.
- Some documents inside `docs/` describe older or proposal-era flows. The source of truth for current behavior is the codebase and running API.

## License

No license file is currently present in this repository.