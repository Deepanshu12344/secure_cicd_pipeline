# AI-Based Secure CI/CD Pipeline with Risk Scoring

A comprehensive, AI-powered DevSecOps solution that integrates intelligent security scanning into CI/CD pipelines with machine learning-based risk scoring.

## 🎯 Project Overview

This enterprise-grade solution combines:
- **Frontend Dashboard**: React-based UI for visualization and monitoring
- **Backend API**: Node.js/Express REST API for core functionality
- **ML/AI Engine**: Python-based machine learning engine for risk scoring
- **VS Code Extension**: Real-time security feedback during development

## 📊 Key Features

### Security Scanning
- Automated code vulnerability detection
- Dependency vulnerability checking
- Configuration security analysis
- Real-time threat identification

### Intelligent Risk Scoring
- ML-based risk calculation
- Severity classification (Critical, High, Medium, Low)
- False positive reduction
- Risk trend analysis

### Pipeline Integration
- Git-based workflow integration
- Automated scanning on push/pull requests
- Configurable risk thresholds
- Build allow/warn/block decisions

### Developer Experience
- VS Code extension for real-time feedback
- Interactive dashboard for insights
- Detailed risk reports
- Actionable remediation suggestions

## 🏗️ Project Structure

```
BtechCapstone/
├── backend/                 # Node.js/Express API
│   ├── src/
│   │   ├── routes/         # API endpoints
│   │   ├── controllers/    # Request handlers
│   │   ├── models/         # Data models
│   │   ├── middleware/     # Auth, validation
│   │   ├── services/       # Business logic
│   │   └── utils/          # Helper functions
│   ├── package.json
│   └── .env.example
│
├── frontend/               # React application
│   ├── src/
│   │   ├── components/     # Reusable React components
│   │   ├── pages/          # Page components
│   │   ├── services/       # API client
│   │   ├── store/          # State management
│   │   ├── hooks/          # Custom React hooks
│   │   └── index.css       # Tailwind styles
│   ├── package.json
│   └── vite.config.js
│
├── ml-engine/             # Python ML/AI service
│   ├── src/
│   │   ├── app.py         # Flask application
│   │   ├── models/        # ML models
│   │   └── utils/         # Processing utilities
│   └── requirements.txt
│
├── vscode-extension/      # VS Code extension
│   ├── src/
│   │   └── extension.js   # Extension entry point
│   └── package.json
│
├── .github/workflows/     # CI/CD configurations
│   └── main.yml          # GitHub Actions
│
└── docs/                  # Documentation
    ├── API.md            # API documentation
    ├── SETUP.md          # Setup guide
    └── ARCHITECTURE.md   # System architecture
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
