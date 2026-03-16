# Secure CI/CD Pipeline with AI Risk Scoring

Full-stack DevSecOps platform that runs code and pipeline security scans, assigns risk scores, and surfaces findings in a web dashboard and VS Code extension. It also includes a faculty evaluation workflow for ingesting CI scan reports and grading submissions.

**Contents**
1. Overview
2. Architecture
3. Project Structure
4. Tech Stack
5. Prerequisites
6. Local Setup
7. Environment Configuration
8. Running the Project
9. Docker Compose
10. Core Workflows
11. API Summary
12. VS Code Extension
13. CI/CD Workflow
14. Faculty Evaluation Module
15. Troubleshooting
16. Documentation

**Overview**
This repository contains four primary services and two analysis tools:
- `frontend` is the React dashboard (Vite + Tailwind).
- `backend` is the Node.js/Express API and database layer.
- `ml-engine` is the Python Flask risk scoring service.
- `vscode-extension` provides IDE scanning commands.
- `Code-Analyzer` performs repo-wide code analysis and PDF/JSON reporting.
- `capci_cd` performs CI/CD pipeline security scanning.

The backend orchestrates scans, stores results, and exposes API endpoints for the dashboard and faculty workflow. The ML engine provides fast, stateless risk scoring and code analysis endpoints.

**Architecture**
Request flow in short:
- Frontend and VS Code extension call the backend for auth, projects, scans, risks, and dashboard metrics.
- Backend triggers the local analyzer scripts for repository scans.
- ML engine exposes `/api/analyze`, `/api/dependencies`, and `/api/score` for scoring and lightweight analysis.
- GitHub Actions can post CI scan results to `/api/scans/ci-ingest` and faculty endpoints.

**Reusable GitHub Action (Single-Line Use)**
This repo is publish-ready as a GitHub Action. Users can run the scan with a single `uses:` line:
```yaml
- name: Secure CI/CD Scan
  uses: your-org/secure-cicd@v1
  with:
    risk-threshold: '80'
    fail-on-critical: 'true'
```
After you publish a release tag (e.g. `v1`), users only need that line in their workflow.

**Release Tag Script**
Create a version tag and push it:
```powershell
.\scripts\release.ps1 -Version 1.0.0
```
```bash
./scripts/release.sh 1.0.0
```
Release checklist (one time per version):
1. Commit all changes.
2. Push to GitHub.
3. Run the release script to create a `vX.Y.Z` tag.
4. In GitHub, create a Release from that tag (optional but recommended).

**How Users Add This To Their Workflow**
Add a job in `.github/workflows/<name>.yml`:
```yaml
name: Secure CI/CD Scan
on:
  push:
    branches:
      - '**'
  pull_request:
    branches:
      - main

jobs:
  secure_scan:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Secure CI/CD Scan
        uses: your-org/secure-cicd@v1
        with:
          python-version: '3.11'
          target-path: '.'
          risk-threshold: '80'
          fail-on-critical: 'true'
          install-external-tools: 'true'
          dashboard-url: ${{ secrets.DASHBOARD_URL }}
          dashboard-project-id: ${{ secrets.DASHBOARD_PROJECT_ID }}
          dashboard-api-key: ${{ secrets.CI_INGEST_API_KEY }}
```
Minimum required:
```yaml
- uses: your-org/secure-cicd@v1
```

**Project Structure**
```
BtechCapstone/
  backend/               Node.js/Express API
  frontend/              React dashboard
  ml-engine/             Python Flask risk scoring service
  vscode-extension/      VS Code extension
  Code-Analyzer/         Repo analyzer that generates PDF/JSON reports
  capci_cd/              CI/CD pipeline scanner
  docs/                  Architecture and setup notes
  docker-compose.yml     Local containers (Mongo, Redis, services)
```

**Tech Stack**
- Frontend: React 18, Vite, Tailwind, Recharts, Zustand, Axios
- Backend: Node.js, Express, Mongoose, JWT, Passport, Multer
- ML Engine: Flask, NumPy, Pandas, scikit-learn, TensorFlow
- Data: MongoDB (required for auth and faculty data), Redis (optional)
- CI: GitHub Actions workflow in `.github/workflows/main.yml`

**Prerequisites**
- Node.js 18+ and npm 9+
- Python 3.9+
- MongoDB (local or Atlas) for authentication and faculty features
- Git
- Optional: Docker and Docker Compose

**Local Setup**
Install dependencies in each service:
```bash
# From repo root
npm install

cd backend
npm install

cd ../frontend
npm install

cd ../ml-engine
pip install -r requirements.txt
```

Copy environment files and update secrets:
```powershell
# Windows PowerShell
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
```

```bash
# macOS/Linux
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Important: `backend/.env.example` contains placeholder values that must be replaced. Do not ship or commit real secrets.

**Environment Configuration**
Backend (`backend/.env`):
- `PORT` default `5000`
- `NODE_ENV` default `development`
- `MONGODB_URI` required for auth, users, students, submissions
- `JWT_SECRET` required for API auth tokens
- `JWT_EXPIRE` token TTL, example `7d`
- `SESSION_SECRET` required for GitHub OAuth sessions
- `FRONTEND_URL` allowed CORS origin, default `http://localhost:3000`
- `ML_ENGINE_URL` ML service base, example `http://localhost:5001`
- `GOOGLE_CLIENT_ID` required for Google sign-in
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` required for GitHub OAuth
- `GITHUB_CALLBACK_URL` or `GITHUB_AUTH_CALLBACK_URL` OAuth callback
- `GITHUB_CONNECT_CALLBACK_URL` GitHub repo connect callback
- `CI_INGEST_API_KEY` shared secret for CI ingest and faculty submissions
- `FACULTY_OPEN_REGISTRATION` set `false` to disable faculty self-signup
- `FACULTY_ALLOWED_EMAIL_DOMAINS` comma-separated domain allowlist
- `PYTHON_BIN` optional, path to python executable for analyzer scripts
- `ANALYZER_MAX_FILES` optional, limits analyzer file count

Frontend (`frontend/.env`):
- `VITE_API_URL` backend base, example `http://localhost:5000/api`
- `VITE_FACULTY_API_URL` backend base for faculty APIs, example `http://localhost:5000/api`
- `VITE_GOOGLE_CLIENT_ID` Google client ID for login UI

ML Engine (`ml-engine`):
- No `.env.example` is included. If needed, create `.env` and set `FLASK_ENV=development` and `FLASK_DEBUG=True`.

Analyzer tools:
- `Code-Analyzer` uses `ANTHROPIC_API_KEY` in `Code-Analyzer/.env` for full AI analysis. See `Code-Analyzer/README.md`.
- `capci_cd` uses Python dependencies from `capci_cd/requirements.txt`.

**Running the Project**
Option A: Run services in separate terminals:
```bash
# Terminal 1
cd backend
npm run dev

# Terminal 2
cd frontend
npm run dev

# Terminal 3
cd ml-engine
python src/app.py
```

Option B: Run all three from the root:
```bash
npm run dev
```

Default URLs:
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:5000/api`
- Backend health: `http://localhost:5000/health`
- ML engine: `http://localhost:5001`

**Local Commit Gate (No Deployment Required)**
Enable a pre-commit gate that scans the CI/CD pipeline and repo before every commit:
```powershell
.\scripts\install-githooks.ps1
```

This runs `capci_cd/run_secure_pipeline.py` on each commit. If critical findings or risk score exceeds the threshold, the commit is blocked.
Override thresholds per shell session:
```powershell
$env:CICD_RISK_THRESHOLD="80"
$env:CICD_FAIL_ON_CRITICAL="true"
```

**Docker Compose**
```bash
docker-compose up --build
```

Compose starts backend, frontend, ML engine, MongoDB, and Redis. It uses the environment values in `docker-compose.yml`. For production, override with a `.env` file or compose overrides.

**Core Workflows**
Create a project and run a scan:
1. Log in to the dashboard at `http://localhost:3000`.
2. Create a project with a repository URL.
3. Create a scan with `POST /api/scans`.
4. Start the scan with `POST /api/scans/:id/run`.
5. Download reports from `GET /api/scans/:id/report?type=pdf` or `type=json`.

Important scan dependencies:
- Repository scans call `Code-Analyzer/analyzer.py`. Install its Python deps and configure `ANTHROPIC_API_KEY`.
- CI/CD security scanning uses `capci_cd/scanner.py`. Install its Python deps.
- If these tools are missing, `/api/scans/:id/run` fails with a clear error.

**API Summary**
Auth:
- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/register-faculty`
- `POST /api/auth/register-student`
- `POST /api/auth/google`
- `GET /api/auth/google/client-id`
- `GET /api/auth/github/login`
- `GET /api/auth/github/callback`
- `GET /api/auth/me`
- `POST /api/auth/profile-photo`
- `POST /api/auth/logout`

Projects:
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id`
- `PATCH /api/projects/:id`
- `DELETE /api/projects/:id`

Scans:
- `GET /api/scans`
- `POST /api/scans`
- `POST /api/scans/:id/run`
- `GET /api/scans/:id`
- `GET /api/scans/:id/report?type=pdf|json`
- `PATCH /api/scans/:id`
- `DELETE /api/scans/:id`
- `DELETE /api/scans/failed`
- `POST /api/scans/ci-ingest`

Risks:
- `GET /api/risks`
- `POST /api/risks`
- `GET /api/risks/:id`
- `PATCH /api/risks/:id`
- `DELETE /api/risks/:id`

Pipelines:
- `GET /api/pipelines`
- `POST /api/pipelines`
- `GET /api/pipelines/:id`
- `PATCH /api/pipelines/:id`

Dashboard:
- `GET /api/dashboard`
- `GET /api/dashboard/risks/trend`
- `GET /api/dashboard/scans/stats`
- `GET /api/dashboard/vulnerabilities/types`

GitHub integration:
- `GET /api/github/connect`
- `GET /api/github/callback`
- `GET /api/github/status`
- `GET /api/github/repos`

Faculty workflow:
- `POST /api/submit-report`
- `POST /api/submit-report-json`
- `GET /api/students`
- `GET /api/student/:id`
- `POST /api/assign-grade`
- `GET /api/analytics/class-summary`
- `GET /api/analytics/leaderboard`
- `GET /api/grades/export-csv`

ML Engine endpoints (direct):
- `POST http://localhost:5001/api/score`
- `POST http://localhost:5001/api/analyze`
- `POST http://localhost:5001/api/dependencies`

**VS Code Extension**
Start the extension:
```bash
cd vscode-extension
npm install
code .
# Press F5 in VS Code to launch the extension host
```

Configuration keys are defined in `vscode-extension/package.json`:
- `secureCicd.apiUrl` API base for extension calls
- `secureCicd.autoScan` auto-scan on save
- `secureCicd.riskThreshold` severity threshold

Note: the extension currently calls `/scans` and `/analyze` on the same `secureCicd.apiUrl`. If you want workspace scans, point it to the backend `http://localhost:5000/api`. If you want file analysis, point it to the ML engine `http://localhost:5001/api` or add a reverse proxy.

**CI/CD Workflow**
GitHub Actions workflow is defined in `.github/workflows/main.yml`:
- Runs the local secure pipeline action.
- Fails the job for critical findings or a score over the threshold.
- Uploads `security-reports/` artifacts.
- Builds and pushes Docker images on push.
- Optionally posts results to the faculty endpoint.

Secrets used by the workflow:
- `DASHBOARD_URL`
- `DASHBOARD_PROJECT_ID`
- `CI_INGEST_API_KEY`
- `FACULTY_API_URL`
- `DOCKER_USERNAME`
- `DOCKER_PASSWORD`
- `DOCKER_NAMESPACE` (optional)

**Faculty Evaluation Module**
Frontend routes:
- `http://localhost:3000/faculty/login`
- `http://localhost:3000/faculty/students`
- `http://localhost:3000/faculty/student/:id`
- `http://localhost:3000/student/reports`

Backend requirements:
- MongoDB must be configured.
- `CI_INGEST_API_KEY` must be set for CI ingestion endpoints.
- `FACULTY_OPEN_REGISTRATION=false` disables self-registration.
- `FACULTY_ALLOWED_EMAIL_DOMAINS` restricts faculty signups by domain.

**Troubleshooting**
- Backend auth returns 503: `MONGODB_URI` is missing or Mongo is down.
- `POST /api/scans/:id/run` fails: install analyzer dependencies and ensure `Code-Analyzer/analyzer.py` exists.
- GitHub OAuth fails: verify `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and callback URLs.
- Frontend API errors: confirm `VITE_API_URL` matches backend and Vite proxy is running.
- Ports in use: change `PORT` in `backend/.env` or Vite config in `frontend/vite.config.js`.

**Documentation**
- `DEVELOPMENT.md` quick start and workflow tips
- `DEPLOYMENT.md` production deployment and ops notes
- `docs/SETUP.md` step-by-step setup
- `docs/ARCHITECTURE.md` system design
- `FILES.md` file structure reference
- `VISUAL_GUIDE.md` UI overview

Last updated: 2026-03-12
