# Deployment & DevOps Guide

## 🚀 Production Deployment

### Prerequisites
- Docker & Docker Compose installed
- Cloud account (AWS, Azure, GCP, or Heroku)
- Domain name (optional)
- SSL certificate (optional)

## 📦 Docker Deployment

### Build Docker Images

```bash
# Build all images
docker-compose build

# Build specific service
docker-compose build backend
docker-compose build frontend
docker-compose build ml-engine
```

### Run with Docker Compose

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Docker Commands Reference

```bash
# List running containers
docker ps

# View logs for specific service
docker logs secure-cicd-backend

# Execute command in container
docker exec -it secure-cicd-backend npm test

# Rebuild and restart
docker-compose up -d --build
```

## ☁️ Cloud Deployment

### AWS Deployment

#### Using Elastic Container Service (ECS)

1. **Create ECR repositories**:
```bash
aws ecr create-repository --repository-name secure-cicd-backend
aws ecr create-repository --repository-name secure-cicd-frontend
aws ecr create-repository --repository-name secure-cicd-ml
```

2. **Build and push images**:
```bash
docker build -t secure-cicd-backend:latest ./backend
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com
docker tag secure-cicd-backend:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/secure-cicd-backend:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/secure-cicd-backend:latest
```

3. **Create ECS cluster and tasks**:
- Use AWS Console or CloudFormation
- Configure task definitions for each service
- Set environment variables
- Configure load balancer

4. **Database setup**:
```bash
# AWS RDS for MongoDB Atlas alternative or DocumentDB
aws docdb create-db-cluster --db-cluster-identifier secure-cicd --engine docdb
```

5. **Caching setup**:
```bash
# ElastiCache for Redis
aws elasticache create-cache-cluster --cache-cluster-id secure-cicd-redis --engine redis
```

### Azure Deployment

#### Using Container Instances & App Service

1. **Create Azure Container Registry**:
```bash
az acr create --resource-group myRG --name securecicdreg --sku Basic
```

2. **Build and push images**:
```bash
az acr build --registry securecicdreg --image secure-cicd-backend:latest ./backend
az acr build --registry securecicdreg --image secure-cicd-frontend:latest ./frontend
az acr build --registry securecicdreg --image secure-cicd-ml:latest ./ml-engine
```

3. **Deploy with App Service**:
```bash
# Create App Service Plan
az appservice plan create --name secure-cicd-plan --resource-group myRG --sku B2

# Create Web App
az webapp create --resource-group myRG --plan secure-cicd-plan --name secure-cicd-backend --deployment-container-image-name securecicdreg.azurecr.io/secure-cicd-backend:latest
```

### Heroku Deployment

#### Deploy from Git

1. **Login to Heroku**:
```bash
heroku login
heroku create secure-cicd
```

2. **Add buildpacks**:
```bash
heroku buildpacks:add heroku/nodejs
heroku buildpacks:add heroku/python
```

3. **Set environment variables**:
```bash
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=<production-secret>
heroku config:set MONGODB_URI=<mongodb-uri>
```

4. **Deploy**:
```bash
git push heroku main
```

## 🔐 Security Checklist

### Environment Variables
- [ ] All secrets in .env.production
- [ ] Never commit sensitive data
- [ ] Use environment variable management service
- [ ] Rotate secrets regularly

### Network Security
- [ ] Enable HTTPS/TLS
- [ ] Configure CORS properly
- [ ] Use security headers
- [ ] Enable rate limiting
- [ ] Setup WAF (Web Application Firewall)

### Application Security
- [ ] Input validation
- [ ] SQL injection prevention
- [ ] CSRF protection
- [ ] XSS prevention
- [ ] Authentication & authorization

### Infrastructure Security
- [ ] Private VPC/network
- [ ] Security groups/network ACLs
- [ ] Encrypted data in transit & at rest
- [ ] Regular security audits
- [ ] Vulnerability scanning

## 📊 Monitoring & Logging

### Application Monitoring

**Setup PM2 for process management**:
```bash
npm install -g pm2

pm2 start backend/src/index.js --name "secure-cicd-backend"
pm2 start frontend/src/main.jsx --name "secure-cicd-frontend"
pm2 start ml-engine/src/app.py --name "secure-cicd-ml"

pm2 save
pm2 startup
```

### Logging Services

**Using Winston for Node.js logging**:
```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});
```

### Monitoring Tools

**Prometheus + Grafana**:
```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'backend'
    static_configs:
      - targets: ['localhost:5000']
  
  - job_name: 'ml-engine'
    static_configs:
      - targets: ['localhost:5001']
```

**ELK Stack (Elasticsearch, Logstash, Kibana)**:
```yaml
version: '3'
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.0.0
  
  logstash:
    image: docker.elastic.co/logstash/logstash:8.0.0
  
  kibana:
    image: docker.elastic.co/kibana/kibana:8.0.0
```

## 🔄 CI/CD Pipeline

### GitHub Actions Workflow

```yaml
name: Deploy to Production

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Build images
      run: docker-compose build
    
    - name: Run tests
      run: |
        docker-compose run backend npm test
        docker-compose run frontend npm test
    
    - name: Push to registry
      run: |
        docker push secure-cicd-backend
        docker push secure-cicd-frontend
        docker push secure-cicd-ml
    
    - name: Deploy to AWS
      run: |
        aws ecs update-service --cluster production --service backend --force-new-deployment
```

## 📈 Scaling Strategies

### Horizontal Scaling

**Load Balancer Configuration**:
```nginx
upstream backend {
    least_conn;
    server backend1:5000;
    server backend2:5000;
    server backend3:5000;
}

server {
    listen 80;
    location /api {
        proxy_pass http://backend;
    }
}
```

### Vertical Scaling
- Increase CPU/memory allocation
- Optimize database queries
- Implement caching
- Use connection pooling

## 🔧 Maintenance

### Database Backup

```bash
# MongoDB backup
mongodump --uri "mongodb://host:27017/secure-cicd" --out backup/

# MongoDB restore
mongorestore --uri "mongodb://host:27017" backup/
```

### Log Rotation

```bash
# Setup logrotate
/var/log/secure-cicd/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
}
```

### Health Checks

```javascript
// Backend health endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date(),
    uptime: process.uptime()
  });
});
```

## 📋 Deployment Checklist

### Pre-Deployment
- [ ] All tests passing
- [ ] Code reviewed
- [ ] Documentation updated
- [ ] Dependencies updated
- [ ] Security audit completed
- [ ] Environment variables configured
- [ ] Database migrations tested
- [ ] Backup created

### Deployment
- [ ] Deploy to staging first
- [ ] Run smoke tests
- [ ] Monitor logs for errors
- [ ] Verify all services running
- [ ] Test critical features
- [ ] Deploy to production
- [ ] Monitor performance metrics

### Post-Deployment
- [ ] Monitor error rates
- [ ] Check performance metrics
- [ ] Verify all endpoints working
- [ ] Test user workflows
- [ ] Document any issues
- [ ] Prepare rollback plan

## 🚨 Disaster Recovery

### Rollback Procedure

```bash
# Rollback to previous version
git revert <commit-hash>
git push origin main

# Or use Docker image tag
docker run secure-cicd-backend:previous
```

### Backup & Recovery

```bash
# Automated daily backups
0 2 * * * /backup/script.sh

# Test restoration
/restore/script.sh --test
```

## 📞 Support & Troubleshooting

### Common Issues

**Container won't start**:
```bash
docker logs <container-name>
docker inspect <container-name>
```

**Database connection error**:
```bash
# Check connectivity
nc -zv mongodb-host 27017

# Verify credentials
mongo --uri "mongodb://user:pass@host:27017/db"
```

**High memory usage**:
```bash
# Monitor memory
docker stats

# Optimize Node.js
NODE_OPTIONS=--max-old-space-size=2048
```

---

**Deployment Status**: Ready for Production ✅
**Last Updated**: February 10, 2026
