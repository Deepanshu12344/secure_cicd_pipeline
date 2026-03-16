# Development Quick Start Guide

## 🚀 5-Minute Setup

### Prerequisites Check
```bash
# Check Node.js
node --version   # Should be 18+

# Check npm
npm --version    # Should be 9+

# Check Python
python --version # Should be 3.9+
```

### Step 1: Install Dependencies

**Root directory**:
```bash
cd d:\BtechCapstone
npm install
```

**Backend**:
```bash
cd backend
npm install
```

**Frontend**:
```bash
cd frontend
npm install
```

**ML Engine**:
```bash
cd ml-engine
pip install -r requirements.txt
```

### Step 2: Start All Services

From project root, run in separate terminals:

**Terminal 1 - Backend**:
```bash
cd backend
npm run dev
# Output: Backend server running on port 5000
```

**Terminal 2 - Frontend**:
```bash
cd frontend
npm run dev
# Output: Frontend running on http://localhost:3000
```

**Terminal 3 - ML Engine**:
```bash
cd ml-engine
python src/app.py
# Output: Running on http://localhost:5001
```

### Step 3: Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000/api
- **ML Engine**: http://localhost:5001

## 📁 Project Structure Overview

```
BtechCapstone/
├── backend/              # REST API (Node.js/Express)
├── frontend/             # Dashboard UI (React)
├── ml-engine/            # AI Risk Scoring (Python)
├── vscode-extension/     # IDE Integration
├── docs/                 # Documentation
├── .github/workflows/    # CI/CD Pipelines
├── docker-compose.yml    # Container orchestration
├── package.json          # Root dependencies
└── README.md             # Project overview
```

## 🔧 Development Workflow

### Adding New Backend Features

1. Create route in `backend/src/routes/`
2. Create controller in `backend/src/controllers/`
3. Add business logic in `backend/src/services/`
4. Update API tests
5. Document in API.md

**Example - New Risk Route**:
```javascript
// backend/src/routes/risks.js
router.get('/by-severity/:severity', async (req, res) => {
  // Handle request
});
```

### Adding Frontend Pages

1. Create component in `frontend/src/pages/`
2. Import in `frontend/src/App.jsx`
3. Add route to React Router
4. Add navigation link in Sidebar
5. Style with Tailwind CSS

**Example - New Page**:
```jsx
// frontend/src/pages/NewPage.jsx
export default function NewPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">New Page</h1>
      {/* Content */}
    </div>
  )
}
```

### ML Engine Model Updates

1. Add new model in `ml-engine/src/models/`
2. Create API endpoint in `ml-engine/src/app.py`
3. Test with sample data
4. Update Backend integration

**Example - New Analysis Function**:
```python
@app.route('/api/new-analysis', methods=['POST'])
def new_analysis():
    # Processing logic
    return jsonify({'success': True, 'data': results})
```

## 🧪 Testing

### Backend Tests
```bash
cd backend
npm test
npm run test:watch
```

### Frontend Tests
```bash
cd frontend
npm test
npm run test:watch
```

### Integration Tests
```bash
cd backend
npm run test:integration
```

## 🐛 Debugging

### Backend Debugging

**VS Code Debug Configuration**:
```json
{
  "type": "node",
  "request": "launch",
  "name": "Backend",
  "program": "${workspaceFolder}/backend/src/index.js"
}
```

### Frontend Debugging

- Use React DevTools browser extension
- Check console in browser DevTools
- Use Vite debugging in VS Code

### ML Engine Debugging

```python
# Add breakpoint
import pdb; pdb.set_trace()

# Run with debug output
FLASK_ENV=development FLASK_DEBUG=1 python src/app.py
```

## 📊 API Testing

### Using cURL

```bash
# Test Backend Health
curl http://localhost:5000/health

# Get Projects
curl http://localhost:5000/api/projects

# Create Project
curl -X POST http://localhost:5000/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","repositoryUrl":"https://..."}'
```

### Using Postman

1. Import collection from `docs/postman.json`
2. Set environment variables
3. Run requests
4. View responses

### Using Thunder Client (VS Code)

1. Install Thunder Client extension
2. Create requests in editor
3. Test APIs directly

## 🔐 Environment Setup

### Backend .env
```ini
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/secure-cicd
JWT_SECRET=dev-secret-key-change-in-production
ML_ENGINE_URL=http://localhost:5001
```

### Frontend .env
```ini
VITE_API_URL=http://localhost:5000/api
```

### ML Engine .env
```ini
FLASK_ENV=development
FLASK_DEBUG=True
BACKEND_URL=http://localhost:5000
```

## 📚 API Documentation

### Available Endpoints

**Projects**:
- `GET /api/projects` - List projects
- `POST /api/projects` - Create project
- `GET /api/projects/:id` - Get project
- `PATCH /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project

**Scans**:
- `GET /api/scans` - List scans
- `POST /api/scans` - Create scan
- `GET /api/scans/:id` - Get scan
- `PATCH /api/scans/:id` - Update scan status
- `DELETE /api/scans/:id` - Delete scan

**Risks**:
- `GET /api/risks` - List risks
- `POST /api/risks` - Create risk
- `GET /api/risks/:id` - Get risk
- `PATCH /api/risks/:id` - Update risk status

**Dashboard**:
- `GET /api/dashboard` - Get metrics
- `GET /api/dashboard/risks/trend` - Risk trends
- `GET /api/dashboard/scans/stats` - Scan stats
- `GET /api/dashboard/vulnerabilities/types` - Vulnerability types

**ML Engine**:
- `POST /api/score` - Calculate risk score
- `POST /api/analyze` - Analyze code
- `POST /api/dependencies` - Check dependencies

## 🎨 Frontend Components

### Key Components
- `Layout` - Main layout wrapper
- `Sidebar` - Navigation menu
- `Navbar` - Top navigation bar
- `Dashboard` - Main dashboard view
- `ProjectsGrid` - Projects display

### State Management (Zustand)
```javascript
// Access state
const { user, token } = useAuthStore()

// Update state
useAuthStore.setState({ user: newUser })
```

## 🔄 Common Tasks

### Add New Route

**Backend**:
```javascript
// 1. Create route handler
router.get('/new-endpoint', (req, res) => {
  res.json({ message: 'Response' })
})

// 2. Import and use in index.js
app.use('/api/namespace', routes)
```

**Frontend**:
```javascript
// 1. Create page component
// 2. Add to router
<Route path="/new-page" element={<NewPage />} />

// 3. Add navigation link
{ path: '/new-page', icon: Icon, label: 'New Page' }
```

### Connect Frontend to Backend

```javascript
// Use API client
import { projectsApi } from '../services/api'

// In component
const [projects, setProjects] = useState([])

useEffect(() => {
  projectsApi.getAll().then(res => {
    setProjects(res.data.data)
  })
}, [])
```

### Add Database Model

```javascript
// backend/src/models/newModel.js
const schema = new mongoose.Schema({
  name: String,
  // fields
})

export default mongoose.model('NewModel', schema)
```

## 🚨 Troubleshooting

### Port Already in Use
```bash
# Find process using port
lsof -i :5000

# Kill process
kill -9 <PID>
```

### Module Not Found
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Python Dependencies Issue
```bash
# Upgrade pip
python -m pip install --upgrade pip

# Reinstall requirements
pip install --force-reinstall -r requirements.txt
```

### Frontend Build Issues
```bash
# Clear cache
rm -rf node_modules dist
npm install
npm run build
```

## 📝 Coding Standards

### JavaScript/Node.js
```javascript
// Use const/let
const user = { name: 'John' }

// Arrow functions
const func = () => { }

// Async/await
async function fetchData() {
  const data = await api.get()
  return data
}

// Error handling
try {
  // code
} catch (error) {
  console.error(error)
}
```

### React Components
```javascript
// Functional components only
export default function MyComponent() {
  const [state, setState] = useState(null)
  
  useEffect(() => {
    // side effects
  }, [dependencies])
  
  return (
    <div className="...">Content</div>
  )
}
```

### Python
```python
# Type hints
def calculate_score(code: str) -> float:
    """Calculate risk score."""
    return score

# Docstrings
"""Module for risk scoring."""

# Error handling
try:
    result = process()
except Exception as e:
    logger.error(f"Error: {e}")
```

## 📞 Getting Help

1. **Check Documentation**: `./docs/`
2. **Review Code Examples**: existing components/routes
3. **Google**: common errors
4. **Team Chat**: ask teammates
5. **GitHub Issues**: report bugs

## ✅ Pre-Commit Checklist

- [ ] Code is formatted (lint passes)
- [ ] Tests pass locally
- [ ] No console errors/warnings
- [ ] Updated documentation
- [ ] Committed with clear message
- [ ] Pushed to feature branch

## 🎓 Learning Resources

- [Express.js Docs](https://expressjs.com/)
- [React Docs](https://react.dev/)
- [Python Flask](https://flask.palletsprojects.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [MongoDB](https://docs.mongodb.com/)

---

**Happy Coding! 🚀**

For detailed setup, see [SETUP.md](./docs/SETUP.md)
For architecture details, see [ARCHITECTURE.md](./docs/ARCHITECTURE.md)
