# AI-Based Secure CI/CD Pipeline with Risk Scoring

A comprehensive, AI-powered DevSecOps solution that integrates intelligent security scanning into CI/CD pipelines with machine learning-based risk scoring.

## 🎯 Project Overview

This enterprise-grade solution combines:
- **Frontend Dashboard**: React-based UI for visualization and monitoring
- **Backend API**: Node.js/Express REST API for core functionality
- **ML/AI Engine**: Python-based machine learning engine for risk scoring
- **VS Code Extension**: Real-time security feedback during development
- **Pre-Commit CLI (`secure-cicd`)**: Cross-platform pre-commit scanner that blocks insecure commits

## 📊 Key Features

### Pre-Commit Security Scanning
- Automated staged file scanning before every `git commit`
- Sub-second execution using SHA-256 caching and AST/regex inspection
- Automatic commit blocking if risks exceed configured threshold
- Masked terminal secret redaction (`AKIA...****...MPLE`)
- Zero mandatory Python dependency for developers (built-in offline rules)
- Automatic online fallback to ML engine when reachable
- Non-destructive hook installer with automatic backup and hook chaining
- Seamless CI Dashboard ingestion and policy bypass tracking

### Security Scanning
- Automated code vulnerability detection (SQLi, XSS, Weak Crypto, Secrets)
- Dependency vulnerability and wildcard package checking
- Configuration and Dockerfile security analysis
- Real-time threat identification

### Intelligent Risk Scoring
- Normalized 0–10 risk calculation scale
- Severity classification (Critical, High, Medium, Low)
- False positive reduction via allowlists and path ignores
- Risk trend analysis

### Pipeline Integration
- Git-based workflow integration
- Automated scanning on push/pull requests
- Configurable risk thresholds
- Build allow/warn/block decisions

### Developer Experience
- VS Code extension for real-time feedback
- Interactive dashboard for insights with Scan Source filters
- Detailed risk reports (ASCII Table, JSON, SARIF 2.1.0)
- Actionable remediation suggestions

## 🏗️ Project Structure

```
secure_cicd_pipeline/
├── cli/                     # Node.js Pre-Commit Scanner & CLI tool
│   ├── bin/secure-cicd.js   # CLI executable entrypoint
│   ├── src/engine/          # Offline rule engine, scorer, cache & git index reader
│   ├── src/commands/        # init, scan, install-hook, uninstall-hook, doctor
│   ├── src/formatters/      # Table, JSON, and SARIF 2.1.0 output
│   └── package.json
│
├── backend/                 # Node.js/Express API
│   ├── src/
│   │   ├── routes/          # API endpoints (scans, ci-status, auth, etc.)
│   │   ├── controllers/     # Request handlers
│   │   ├── models/          # Data models (Scan, Risk, Project, Pipeline)
│   │   ├── middleware/      # Auth, validation
│   │   └── utils/           # CI Dashboard store & sync helpers
│   ├── package.json
│   └── .env.example
│
├── frontend/                # React application
│   ├── src/
│   │   ├── components/      # Reusable React components
│   │   ├── pages/           # Scans (with Source filter), Home, Dashboard, etc.
│   │   ├── services/        # API client
│   │   └── store/           # State management
│   ├── package.json
│   └── vite.config.js
│
├── ml-engine/               # Python ML/AI service
│   ├── src/
│   │   ├── app.py           # Flask application
│   │   ├── models/          # ML models
│   │   └── utils/           # Processing utilities
│   └── requirements.txt
│
├── vscode-extension/        # VS Code extension
│   ├── src/
│   │   └── extension.js     # Extension entry point
│   └── package.json
│
├── .github/workflows/       # CI/CD configurations
│   └── main.yml             # GitHub Actions
│
├── .pre-commit-hooks.yaml   # Python pre-commit framework manifest
└── docs/                    # Documentation
    ├── API.md               # API documentation
    ├── SETUP.md             # Setup guide
    └── ARCHITECTURE.md      # System architecture
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Python 3.9+
- MongoDB (optional, for persistence)
- Git

### Backend Setup

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

Backend runs on `http://localhost:5000`

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`

### ML Engine Setup

```bash
cd ml-engine
pip install -r requirements.txt
python src/app.py
```

ML Engine runs on `http://localhost:5001`

### VS Code Extension Setup

```bash
cd vscode-extension
npm install
# Open in VS Code and press F5 to debug
```

### Pre-Commit CLI Scanner Setup

The pre-commit scanner (`secure-cicd`) can be installed into any git project with a single command:

```bash
# Inside any repository
npx secure-cicd init
```

This creates a customized `.securecicd.yaml` configuration file and installs a non-destructive `.git/hooks/pre-commit` hook that automatically protects the repository on every `git commit`.

---

## 🛡️ Pre-Commit Security Scanner Guide

The `secure-cicd` CLI is an autonomous, developer-friendly security scanner designed to prevent vulnerable code from entering version control.

### Key Capabilities

1. **Deterministic Built-in Rules**:
   - **Secrets**: API keys, AWS credentials, GitHub tokens, database URIs with passwords, private keys, staged `.env` files.
   - **SQL Injection**: Dynamic string concatenations and template literals in SQL queries.
   - **Cross-Site Scripting (XSS)**: Unsanitized DOM injection (`innerHTML`, `dangerouslySetInnerHTML`, `eval`).
   - **Insecure Cryptography**: MD5, SHA-1, broken DES/RC4 ciphers, weak random tokens for auth.
   - **Security Configurations**: `curl | bash` pipelines, wildcard CORS with credentials, Docker `--privileged`.
   - **Dependency Vulnerabilities**: Wildcard dependency versions (`"*"`, `">="`) in `package.json` and `requirements.txt`.

2. **Automated Risk Scoring & Gate Evaluation**:
   - Risk score calculated on a standard **0–10 scale** (Low: 0.5, Medium: 1.0, High: 1.5, Critical: 2.5 per issue).
   - Blocks commit if risk score exceeds `max_risk_score` (default: 6.0) or if finding matches `fail_on` severity (default: `high`).

3. **Masked Secret Redaction**:
   - Secrets are masked with asterisks in console reports (e.g., `AKIA...****...MPLE`), preventing accidental leaks in terminals or CI logs.

4. **Zero-Friction Git Integration**:
   - Reads directly from git staging index (`git show :<file>`), ignoring unstaged workspace edits.
   - Skips binaries, minified bundles, and files larger than 1MB.
   - Uses SHA-256 caching (`.securecicd_cache.json`) for sub-second execution (<500ms).
   - Hook installer creates backups (`pre-commit.backup.<timestamp>`) and chains existing pre-commit hooks safely.

5. **Dual Operating Modes**:
   - **Online Mode**: Queries `ml-engine` (`http://localhost:5001`) for enhanced ML vulnerability classification.
   - **Offline Mode**: Operates autonomously with zero external dependencies when `ml-engine` is unreachable.

### Installation Options

#### Option A: Standalone NPX (Recommended - Zero Installation)
```bash
# One-time initialization in any project
npx secure-cicd init

# Or install globally
npm install -g secure-cicd
secure-cicd init
```

#### Option B: Python Pre-Commit Framework
Add to your project's `.pre-commit-config.yaml`:
```yaml
repos:
  - repo: https://github.com/your-org/secure_cicd_pipeline
    rev: v1.0.0
    hooks:
      - id: secure-cicd
```

#### Option C: Husky (Modern Web Projects)
```bash
npm install --save-dev husky
npx husky init
echo "npx secure-cicd scan --staged" > .husky/pre-commit
```

### Configuration (`.securecicd.yaml`)

```yaml
# Secure CI/CD Pre-Commit Scanner Configuration
version: 1

# Scan scope: 'staged' (fast, staged files only) or 'all' (entire repository)
scan_scope: staged

# Minimum finding severity that blocks a commit: 'critical' | 'high' | 'medium' | 'low'
fail_on: high

# Maximum allowed overall risk score on a 0-10 scale (blocks if score > threshold)
max_risk_score: 6.0

# Operating mode: 'block' (block commit), 'warn' (show report but allow commit), or 'off'
mode: block

# Optional URL to ML engine (seamlessly falls back to offline rules if unreachable)
ml_engine_url: http://localhost:5001

# Optional CI Dashboard integration
dashboard:
  enabled: true
  url: "http://localhost:5000"
  api_key_env: CI_INGEST_API_KEY

# Ignore file paths and specific rule IDs
ignore:
  paths:
    - "node_modules/**"
    - "dist/**"
    - "build/**"
    - "*.min.js"
    - "*.min.css"
  rules: []

# Known false-positive exceptions
allowlist:
  - rule: "SEC-004"
    path: "tests/fixtures/sample.js"
    reason: "Dummy test fixture credential"
```

### CLI Command Reference

| Command | Description |
|---|---|
| `secure-cicd init` | Creates `.securecicd.yaml` and installs the git pre-commit hook |
| `secure-cicd scan --staged` | Scans staged git files (default mode during git commit) |
| `secure-cicd scan --all` | Scans all files across the repository |
| `secure-cicd scan --format json` | Outputs report in structured JSON format |
| `secure-cicd scan --format sarif` | Generates standard SARIF 2.1.0 output for GitHub / IDE integration |
| `secure-cicd doctor` | Runs diagnostics on git repository, config, hooks, and services |
| `secure-cicd install-hook` | Installs or updates the Git pre-commit hook with backup |
| `secure-cicd uninstall-hook` | Cleanly removes hook and restores any previous backup |

### Bypassing Security Gates

When an emergency hotfix requires committing code despite security warnings, developers can bypass using either method:

1. **Git Native Flag**:
   ```bash
   git commit --no-verify -m "Emergency fix"
   ```
2. **Environment Variable**:
   ```bash
   SECURECICD_SKIP=1 git commit -m "Emergency fix"
   ```
   *Note: If dashboard reporting is enabled, bypassed commits are logged with a prominent `[BYPASSED]` audit badge in the web dashboard.*

---

## 📡 API Endpoints

### Projects
- `GET /api/projects` - List all projects
- `POST /api/projects` - Create new project
- `GET /api/projects/:id` - Get project details
- `PATCH /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project

### Scans
- `GET /api/scans` - List scans
- `POST /api/scans` - Create scan
- `GET /api/scans/:id` - Get scan details
- `PATCH /api/scans/:id` - Update scan status
- `DELETE /api/scans/:id` - Delete scan

### Risks
- `GET /api/risks` - List identified risks
- `POST /api/risks` - Create risk record
- `GET /api/risks/:id` - Get risk details
- `PATCH /api/risks/:id` - Update risk status

### Pipelines
- `GET /api/pipelines` - List pipelines
- `POST /api/pipelines` - Create pipeline config
- `GET /api/pipelines/:id` - Get pipeline
- `PATCH /api/pipelines/:id` - Update pipeline

### Dashboard
- `GET /api/dashboard` - Get metrics
- `GET /api/dashboard/risks/trend` - Risk trends
- `GET /api/dashboard/scans/stats` - Scan statistics
- `GET /api/dashboard/vulnerabilities/types` - Vulnerability breakdown

### ML/AI Engine
- `POST /api/score` - Calculate risk score
- `POST /api/analyze` - Analyze code
- `POST /api/dependencies` - Check dependencies

## 🔐 Security

- JWT-based authentication
- CORS configuration
- Input validation
- Environment variable management
- API rate limiting (to be added)

## 📈 Risk Scoring Algorithm

The ML engine calculates risk scores (0-10) based on:

```
Risk Score = Σ(Vulnerability Weight × Count) / 10
```

Where vulnerability weights are:
- SQL Injection: 10
- Authentication Bypass: 9
- XSS: 8
- Data Exposure: 8
- Weak Encryption: 7
- Insecure Dependencies: 6
- Misconfiguration: 5
- Missing CORS: 4

## 🎨 Frontend Features

### Dashboard
- Real-time metrics and KPIs
- Risk trend visualization
- Vulnerability type breakdown
- Recent activity feed

### Projects Management
- Create and manage projects
- View project risk scores
- Access recent scans

### Scans
- View scan history
- Monitor scan progress
- Access detailed findings

### Risk Management
- Filter by severity and project
- Mark risks as resolved
- Add notes and comments

### Pipelines
- Configure CI/CD rules
- Set risk thresholds
- Define approval workflows

## 🧠 ML/AI Features

### Vulnerability Detection
- Pattern-based detection
- ML-trained classifiers
- False positive filtering

### Risk Prediction
- Historical data analysis
- Trend prediction
- Anomaly detection

### Recommendations
- Contextual remediation steps
- Best practice suggestions
- Automated fix proposals

## 📝 Environment Variables

### Backend (.env)
```
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/secure-cicd
JWT_SECRET=your_secret_key
ML_ENGINE_URL=http://localhost:5001
```

### Frontend (.env)
```
VITE_API_URL=http://localhost:5000/api
```

### ML Engine (.env)
```
FLASK_ENV=development
FLASK_DEBUG=True
BACKEND_URL=http://localhost:5000
```

## 🧪 Testing

### Backend Tests
```bash
cd backend
npm test
```

### Frontend Tests
```bash
cd frontend
npm test
```

### E2E Tests (to be added)
```bash
npm run test:e2e
```

## 📚 Documentation

- [API Documentation](./docs/API.md)
- [Setup Guide](./docs/SETUP.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Contributing](./CONTRIBUTING.md)

## 🤝 Contributing

Contributions are welcome! Please follow:
1. Fork the repository
2. Create a feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request

## 📄 License

MIT License - See LICENSE file for details

## 👥 Team

- **Project Lead**: [Your Name]
- **Backend Developer**: [Name]
- **Frontend Developer**: [Name]
- **ML Engineer**: [Name]

## 📞 Support

For issues and questions:
- GitHub Issues: [Project Issues]
- Email: support@securecicd.dev
- Documentation: [Wiki]

## 🎓 Learning Resources

- [CI/CD Security Best Practices](https://owasp.org/)
- [ML for Security](https://arxiv.org/)
- [DevSecOps Guide](https://www.devsecops.org/)

## 🗺️ Roadmap

- [ ] Advanced ML models
- [ ] Container security scanning
- [ ] Infrastructure-as-Code analysis
- [ ] Multi-tenant support
- [ ] Enterprise authentication
- [ ] Real-time collaboration
- [ ] Custom rule engine
- [ ] Mobile application

## 📊 Metrics & KPIs

- Scan accuracy: > 95%
- False positive rate: < 5%
- Average scan time: < 10 minutes
- API response time: < 200ms
- Dashboard load time: < 2 seconds

---

**Last Updated**: February 2026
**Version**: 1.0.0

## GitHub Actions CI/CD

This repository includes `.github/workflows/main.yml` that runs on every commit push and pull request:

1. Runs the secure CI/CD scan (`.github/actions/secure-pipeline`).
2. Fails immediately if critical findings are detected or risk score is over threshold.
3. Uploads security report artifacts.
4. On push events, builds and pushes Docker images for:
   - `backend`
   - `frontend`
   - `ml-engine`

Required GitHub repository secrets:

- `DOCKER_USERNAME`
- `DOCKER_PASSWORD`
- `DOCKER_NAMESPACE` (optional; defaults to `DOCKER_USERNAME`)
- `DASHBOARD_URL` (example: `https://your-dashboard.example.com`)
- `CI_INGEST_API_KEY` (must match backend `CI_INGEST_API_KEY`)
- `DASHBOARD_PROJECT_ID` (recommended; if omitted, backend auto-matches by repository URL/full name)
