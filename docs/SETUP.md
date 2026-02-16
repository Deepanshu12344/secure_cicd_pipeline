# Setup Guide

Complete setup instructions for the Secure CI/CD Pipeline project.

## System Requirements

- **OS**: Windows 10/11, macOS 10.14+, Ubuntu 18.04+
- **Node.js**: 18.x or higher
- **Python**: 3.9 or higher
- **npm**: 9.x or higher
- **RAM**: 8GB minimum
- **Disk Space**: 5GB minimum

## Installation Steps

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/secure-cicd.git
cd BtechCapstone
```

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Configure the environment
# Edit .env and update values as needed

# Start development server
npm run dev
```

**Backend runs on**: `http://localhost:5000`

#### Database Setup (Optional - MongoDB)

```bash
# Using Docker
docker run -d -p 27017:27017 --name mongodb mongo:latest

# Or install MongoDB locally
# https://docs.mongodb.com/manual/installation/
```

### 3. Frontend Setup

```bash
cd ../frontend

# Install dependencies
npm install

# Configure API endpoint (if needed)
# Edit vite.config.js proxy settings

# Start development server
npm run dev
```

**Frontend runs on**: `http://localhost:3000`

### 4. ML/AI Engine Setup

```bash
cd ../ml-engine

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install flask flask-cors numpy pandas scikit-learn tensorflow requests python-dotenv

# Create environment file
cp .env.example .env

# Start ML engine
python src/app.py
```

**ML Engine runs on**: `http://localhost:5001`

### 5. VS Code Extension Setup

```bash
cd ../vscode-extension

# Install dependencies
npm install

# Open VS Code from this directory
code .

# Press F5 to launch extension in debug mode
```

## Post-Installation Configuration

### 1. Create API Keys

Generate necessary API keys for external services:

- GitHub Token: https://github.com/settings/tokens
- GitLab Token: https://gitlab.com/-/profile/personal_access_tokens
- Bitbucket App Password: https://bitbucket.org/account/settings/app-passwords/

### 2. Configure .env Files

#### Backend (.env)
```ini
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/secure-cicd
JWT_SECRET=your_very_secure_random_string_here
JWT_EXPIRE=7d
VSCODE_API_URL=http://localhost:5000/api/vscode
ML_ENGINE_URL=http://localhost:5001
GITHUB_TOKEN=your_github_token
GITLAB_TOKEN=your_gitlab_token
BITBUCKET_TOKEN=your_bitbucket_token
```

#### ML Engine (.env)
```ini
FLASK_ENV=development
FLASK_DEBUG=True
BACKEND_URL=http://localhost:5000
ML_MODEL_PATH=./models/risk_scorer.pkl
```

### 3. VS Code Settings

Add to `.vscode/settings.json`:
```json
{
  "secureCicd.apiUrl": "http://localhost:5000/api",
  "secureCicd.autoScan": true,
  "secureCicd.riskThreshold": "medium"
}
```

## Verification

### Check Backend
```bash
curl http://localhost:5000/health
```

Expected response:
```json
{
  "status": "Backend is running",
  "timestamp": "2026-02-10T..."
}
```

### Check Frontend
Open `http://localhost:3000` in browser

### Check ML Engine
```bash
curl http://localhost:5001/health
```

Expected response:
```json
{
  "status": "ML Engine is running",
  "timestamp": "2026-02-10T..."
}
```

## Development Workflow

### Running All Services

Use the provided script to start all services:

**Windows (PowerShell)**:
```powershell
# Terminal 1: Backend
cd backend; npm run dev

# Terminal 2: Frontend
cd frontend; npm run dev

# Terminal 3: ML Engine
cd ml-engine; python src/app.py

# Terminal 4: VS Code Extension (optional)
cd vscode-extension; code .
```

**macOS/Linux (Bash)**:
```bash
# Run in separate terminals or use tmux/screen
```

### Code Formatting

```bash
# Backend
cd backend
npm run lint
npm run lint:fix

# Frontend
cd frontend
npm run lint
npm run lint:fix
```

### Running Tests

```bash
# Backend
cd backend
npm test

# Frontend (when configured)
cd frontend
npm test
```

## Troubleshooting

### Port Already in Use

**Backend port 5000 in use**:
```bash
# Windows
netstat -ano | findstr :5000
taskkill /PID <pid> /F

# macOS/Linux
lsof -i :5000
kill -9 <pid>
```

**Change port in .env**:
```ini
PORT=5001
```

### MongoDB Connection Error

```bash
# Check MongoDB is running
# Windows: Check Services
# macOS: brew services list
# Linux: systemctl status mongod

# Or use MongoDB Atlas (cloud)
# Update MONGODB_URI in .env
```

### Python Virtual Environment Issues

```bash
# Remove and recreate
rm -rf venv
python -m venv venv

# Windows:
venv\Scripts\activate

# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
```

### Module Not Found Error

```bash
# Backend
cd backend
rm -rf node_modules package-lock.json
npm install

# Frontend
cd frontend
rm -rf node_modules package-lock.json
npm install

# ML Engine
pip install --upgrade pip
pip install -r requirements.txt
```

### Extension Not Loading

1. Ensure VS Code version is 1.85+
2. Check extension logs: Output → Extension Host
3. Rebuild: `npm run compile`
4. Reload VS Code window

## Docker Setup (Optional)

### Build Docker Images

```bash
# Backend
docker build -t secure-cicd-backend ./backend

# Frontend
docker build -t secure-cicd-frontend ./frontend

# ML Engine
docker build -t secure-cicd-ml ./ml-engine
```

### Run with Docker Compose

```bash
docker-compose up
```

See `docker-compose.yml` for configuration.

## Production Deployment

### Backend
```bash
npm run build
npm start
```

### Frontend
```bash
npm run build
# Serve dist/ folder with nginx or similar
```

### ML Engine
```bash
gunicorn --bind 0.0.0.0:5001 src.app:app
```

## Next Steps

1. Create your first project
2. Configure a repository
3. Run initial scan
4. Review the dashboard
5. Set up CI/CD integration

## Getting Help

- Check documentation: `./docs/`
- Review issues: GitHub Issues
- Contact: support@securecicd.dev

---

**Happy coding! 🚀**
