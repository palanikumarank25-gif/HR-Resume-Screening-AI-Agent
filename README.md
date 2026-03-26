# Nexxora HR Resume Screening AI

Enterprise-ready Django + static frontend system for:
- Bulk recursive resume ingestion from local dump paths
- Auto profile bucketing
- Vector + rule hybrid JD matching
- RAG retrieval across resume chunks
- Candidate lifecycle lock/unlock (selected pool exclusion)
- Interview campaign slot scheduling with anti-double-booking guard
- Token-based login/logout with unified workspace UI

## Architecture (Implemented)

1. Ingestion layer
- Endpoint: `POST /api/ingest/path/`
- Recursively scans folders for PDF/DOCX/DOC/image files
- Stores run + per-file status in:
  - `ResumeIngestionRun`
  - `ResumeIngestionItem`

2. Resume intelligence layer
- Extracts candidate profile (name/contact/skills/experience/role)
- Auto assigns `ProfileBucket` (tree-compatible model with parent support)
- Stores:
  - `Candidate` structured data + lifecycle state
  - `ResumeChunk` chunked text for RAG
  - document/chunk embeddings

3. Matching layer
- Endpoint: `POST /api/screenings/`
- Pipeline: bucket inference -> vector scoring -> rule reranking
- Persists screening runs/matches:
  - `JDScreeningRun`
  - `JDScreeningMatch`
  - also upserts `JobMatch` for persistent job dashboards

4. Workflow automation layer
- Lifecycle endpoint: `POST /api/candidates/<candidate_id>/lifecycle/`
  - actions: `select`, `reject`, `unlock`
- Selected candidates are locked out from future matching until unlocked

5. Interview scheduling layer
- Campaign endpoint: `POST /api/interview-campaigns/`
- Auto slot generation + guarded booking:
  - `POST /api/interview-slots/book/`
- Booking uses transactional lock to prevent two candidates booking same slot
- Invitation links:
  - `POST /api/interview-campaigns/<campaign_id>/send-invitations/`
  - `GET /api/public/invitations/<token>/slots/`
  - `POST /api/public/invitations/<token>/book/`

6. RAG question answering
- Endpoint: `POST /api/rag/query/`
- Retrieves top chunks by vector similarity
- Optional LLM answer generation if `OPENAI_API_KEY` is configured

7. Async execution (Celery-ready)
- Ingestion and screening endpoints accept `run_async=true`
- Default local behavior uses eager execution (`CELERY_TASK_ALWAYS_EAGER=1`)

## Key Backend Files

- `backend/apps/candidate_app/models.py`
- `backend/apps/candidate_app/views.py`
- `backend/apps/candidate_app/tasks.py`
- `backend/apps/candidate_app/services/ingestion.py`
- `backend/apps/candidate_app/services/matching.py`
- `backend/apps/candidate_app/services/rag.py`
- `backend/apps/candidate_app/services/scheduling.py`
- `backend/apps/candidate_app/migrations/0009_resumeingestionrun_alter_candidate_options_and_more.py`

## Frontend Updates

- Complete UI rework:
  - `frontend/auth.html`
  - `frontend/app.html`
  - `frontend/booking.html`
  - `frontend/app.js`
  - `frontend/app.css`
- Legacy pages (`dashboard.html`, `upload.html`, etc.) now redirect to new workspace tabs.

## Setup

1. Create/activate Python environment
2. Install deps:
```bash
pip install -r backend/requirements.txt
```
3. Run migrations:
```bash
cd backend
python manage.py migrate
```
4. Start backend:
```bash
python manage.py runserver
```
Quick start on Windows:
```bat
run_localhost.bat
```
5. Start frontend static server:
```bash
cd ..\frontend
python -m http.server 5501
```
6. Open:
- `http://127.0.0.1:5501/auth.html`
- `http://127.0.0.1:5501/app.html`
- Candidate booking links open `http://127.0.0.1:5501/booking.html?token=...`

Auth API:
- `POST /api/auth/signup/`
- `POST /api/auth/login/`
- `POST /api/auth/logout/`
- `GET /api/auth/me/`

7. Optional real async workers:
```bash
cd ..\backend
celery -A hr_resume_ai worker -l info
```

## Environment Variables (Recommended)

- `DJANGO_SECRET_KEY`
- `DJANGO_DEBUG`
- `DJANGO_ALLOWED_HOSTS`
- `OPENAI_API_KEY` (optional for LLM answer / OpenAI embeddings)
- `OPENAI_EMBEDDING_MODEL` (optional, default `text-embedding-3-small`)
- `DJANGO_TIME_ZONE`
- `EMAIL_PROVIDER` (`console` or `smtp`)
- `FRONTEND_BASE_URL`
- `CELERY_TASK_ALWAYS_EAGER`, `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`

## Validated

- `python manage.py check` passes
- `python manage.py test apps.candidate_app` passes (4 tests)
