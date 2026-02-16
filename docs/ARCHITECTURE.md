# Project Architecture

## System Overview

The Secure CI/CD Pipeline is built on a microservices architecture with distinct layers:

```
┌─────────────────────────────────────────────────────────────┐
│                     Developer Clients                        │
├─────────────────────────────────────────────────────────────┤
│  VS Code Extension  │  Web Dashboard  │  CI/CD Systems      │
└──────────┬──────────┴────────┬────────┴──────────┬──────────┘
           │                   │                   │
           └───────────────────┼───────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   API Gateway       │
                    │  (Express/CORS)     │
                    └──────────┬──────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
    ┌───▼────┐            ┌───▼────┐            ┌───▼────┐
    │Backend  │            │  ML    │            │ Events │
    │  API    │            │Engine  │            │ Queue  │
    │(Node)   │            │(Python)│            │        │
    └───┬────┘            └───┬────┘            └────────┘
        │                     │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │  Data Layer         │
        │  (MongoDB/Cache)    │
        └─────────────────────┘
```

## Architecture Components

### 1. Frontend Layer (React + Tailwind)

**Directory Structure**:
```
frontend/
├── src/
│   ├── components/        # Reusable UI components
│   │   ├── Layout.jsx
│   │   ├── Sidebar.jsx
│   │   └── Navbar.jsx
│   ├── pages/            # Full page components
│   │   ├── Dashboard.jsx
│   │   ├── Projects.jsx
│   │   ├── Scans.jsx
│   │   ├── Risks.jsx
│   │   ├── Pipelines.jsx
│   │   └── ProjectDetail.jsx
│   ├── services/         # API client
│   │   └── api.js
│   ├── store/            # State management (Zustand)
│   │   └── auth.js
│   ├── hooks/            # Custom React hooks
│   ├── App.jsx           # Main app component
│   └── index.css         # Global styles
├── vite.config.js
└── package.json
```

**Technologies**:
- React 18
- React Router v6
- Zustand (state management)
- Axios (HTTP client)
- Recharts (data visualization)
- Tailwind CSS (styling)
- Vite (build tool)

**Key Features**:
- Responsive dashboard
- Real-time data visualization
- Project management interface
- Risk assessment views
- Pipeline configuration

### 2. Backend API Layer (Node.js + Express)

**Directory Structure**:
```
backend/
├── src/
│   ├── routes/           # API endpoints
│   │   ├── auth.js
│   │   ├── projects.js
│   │   ├── scans.js
│   │   ├── risks.js
│   │   ├── pipelines.js
│   │   └── dashboard.js
│   ├── controllers/      # Request handlers
│   ├── models/           # Data models
│   ├── middleware/       # Auth, validation, error handling
│   │   └── auth.js
│   ├── services/         # Business logic
│   │   ├── scanService.js
│   │   ├── riskService.js
│   │   └── mlService.js
│   ├── utils/            # Utilities
│   │   ├── validators.js
│   │   └── errors.js
│   └── index.js         # App entry point
├── package.json
└── .env.example
```

**Technologies**:
- Node.js
- Express.js (web framework)
- Mongoose (MongoDB ODM)
- JWT (authentication)
- Axios (HTTP client)
- Multer (file upload)

**API Endpoints**:
- `/api/auth/` - Authentication
- `/api/projects/` - Project management
- `/api/scans/` - Scan operations
- `/api/risks/` - Risk management
- `/api/pipelines/` - Pipeline configuration
- `/api/dashboard/` - Dashboard metrics

### 3. ML/AI Engine (Python + Flask)

**Directory Structure**:
```
ml-engine/
├── src/
│   ├── app.py            # Flask application
│   ├── models/           # ML models
│   │   ├── risk_scorer.py
│   │   └── vulnerability_detector.py
│   ├── utils/            # Processing utilities
│   │   ├── scanner.py
│   │   └── analyzer.py
│   └── config.py
├── requirements.txt
└── .env.example
```

**Technologies**:
- Flask (web framework)
- Scikit-learn (ML)
- TensorFlow (deep learning)
- Pandas (data processing)
- NumPy (numerical computation)

**Key Services**:
- Code vulnerability detection
- Risk score calculation
- Dependency analysis
- Pattern matching for known vulnerabilities

**Endpoints**:
- `POST /api/score` - Calculate risk
- `POST /api/analyze` - Analyze code
- `POST /api/dependencies` - Check dependencies

### 4. VS Code Extension

**Directory Structure**:
```
vscode-extension/
├── src/
│   ├── extension.js      # Extension entry point
│   ├── commands.js       # Command handlers
│   ├── diagnostics.js    # Diagnostic reporting
│   └── client.js         # API client
└── package.json
```

**Technologies**:
- VS Code API
- Axios (HTTP client)
- Node.js

**Features**:
- Real-time code scanning
- Inline diagnostics
- Command palette integration
- Configuration UI
- Status bar updates

## Data Flow

### Scan Workflow

```
1. User initiates scan (Frontend)
   ↓
2. Backend receives scan request
   ↓
3. Backend queues scan task
   ↓
4. ML Engine processes code/dependencies
   ↓
5. ML Engine calculates risk scores
   ↓
6. ML Engine sends results to Backend
   ↓
7. Backend stores findings
   ↓
8. Frontend displays results in real-time
```

### Risk Scoring Algorithm

```
Input: Code analysis, dependencies, configurations

Process:
1. Extract vulnerabilities
2. Assign weights (10-4 scale)
3. Count violations
4. Calculate: Σ(weight × count) / 10
5. Normalize to 0-10 scale
6. Classify severity

Output: Risk score + level (Critical/High/Medium/Low)
```

## Database Schema

### Projects Collection
```javascript
{
  _id: ObjectId,
  name: String,
  description: String,
  repositoryUrl: String,
  repositoryType: String,
  language: String,
  riskScore: Number,
  status: String,
  createdAt: Date,
  lastScan: Date
}
```

### Scans Collection
```javascript
{
  _id: ObjectId,
  projectId: ObjectId,
  repositoryUrl: String,
  scanType: String,
  branch: String,
  status: String,
  progress: Number,
  findings: Array,
  startedAt: Date,
  completedAt: Date,
  createdAt: Date
}
```

### Risks Collection
```javascript
{
  _id: ObjectId,
  projectId: ObjectId,
  title: String,
  description: String,
  severity: String,
  riskScore: Number,
  file: String,
  line: Number,
  status: String,
  createdAt: Date,
  updatedAt: Date
}
```

## API Contract

### Request/Response Format

**Request**:
```json
{
  "method": "POST",
  "headers": {
    "Content-Type": "application/json",
    "Authorization": "Bearer token"
  },
  "body": {
    "projectId": "uuid",
    "repositoryUrl": "https://..."
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "riskScore": 6.5,
    "findings": []
  }
}
```

## Security Architecture

```
┌─────────────────────────────────────┐
│      Authentication Layer           │
│  (JWT tokens, API keys)             │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      Authorization Layer             │
│  (Role-based access control)        │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      Input Validation Layer         │
│  (Schema validation, sanitization)  │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      Business Logic Layer           │
│  (Core functionality)               │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      Data Access Layer              │
│  (Database operations)              │
└─────────────────────────────────────┘
```

## Scalability Considerations

1. **Horizontal Scaling**:
   - Load balancer for multiple backend instances
   - Separate ML engine instances for parallel processing
   - Distributed cache (Redis)

2. **Vertical Scaling**:
   - Optimize database queries
   - Implement caching strategies
   - Use connection pooling

3. **Asynchronous Processing**:
   - Message queue for long-running scans
   - WebSocket for real-time updates
   - Background job processing

## Monitoring & Logging

```
┌──────────────────────────────────────┐
│     Logging System                   │
│  (Winston, Morgan)                   │
└──────────────┬───────────────────────┘
               │
┌──────────────▼───────────────────────┐
│     Monitoring                       │
│  (Prometheus, Grafana)              │
└──────────────┬───────────────────────┘
               │
┌──────────────▼───────────────────────┐
│     Alerting                         │
│  (Email, Slack, webhooks)           │
└──────────────────────────────────────┘
```

## Deployment Architecture

```
┌─────────────────────────────────────┐
│      Cloud Provider                  │
│  (AWS, Azure, GCP)                  │
├─────────────────────────────────────┤
│  ┌──────────────────────────────┐  │
│  │  Load Balancer               │  │
│  └────────────┬─────────────────┘  │
│               │                    │
│  ┌────────────▼──────────────────┐ │
│  │  Backend Instances (Docker)   │ │
│  │  - Replicas: 3+               │ │
│  └──────────────────────────────┘ │
│                                    │
│  ┌──────────────────────────────┐ │
│  │  ML Engine (GPU enabled)      │ │
│  │  - Instances: 2+              │ │
│  └──────────────────────────────┘ │
│                                    │
│  ┌──────────────────────────────┐ │
│  │  Database Cluster            │ │
│  │  - Replicas: 3               │ │
│  └──────────────────────────────┘ │
│                                    │
│  ┌──────────────────────────────┐ │
│  │  Cache Layer (Redis)         │ │
│  │  - Cluster: 3 nodes          │ │
│  └──────────────────────────────┘ │
└─────────────────────────────────────┘
```

---

**Last Updated**: February 2026
