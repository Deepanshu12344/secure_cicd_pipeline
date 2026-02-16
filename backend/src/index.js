import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import scanRoutes from './routes/scans.js';
import riskRoutes from './routes/risks.js';
import pipelineRoutes from './routes/pipelines.js';
import dashboardRoutes from './routes/dashboard.js';

app.get('/health', (req, res) => {
  res.json({ status: 'Backend is running', timestamp: new Date() });
});

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/scans', scanRoutes);
app.use('/api/risks', riskRoutes);
app.use('/api/pipelines', pipelineRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

const ensureUserIndexes = async () => {
  const usersCollection = mongoose.connection.collection('users');

  const indexes = await usersCollection.indexes();
  const legacyGoogleIndex = indexes.find((index) => index.name === 'googleId_1');

  if (legacyGoogleIndex) {
    await usersCollection.dropIndex('googleId_1');
    console.log('Dropped legacy users.googleId_1 unique index');
  }

  await usersCollection.createIndex(
    { googleId: 1 },
    {
      name: 'googleId_unique_non_null',
      unique: true,
      partialFilterExpression: { googleId: { $type: 'string' } }
    }
  );
};

const startServer = async () => {
  try {
    if (!MONGODB_URI) {
      console.warn('MongoDB URI not set. Add MONGODB_URI in backend/.env for auth persistence.');
    } else {
      await mongoose.connect(MONGODB_URI);
      console.log('MongoDB connected');
      await ensureUserIndexes();
    }

    app.listen(PORT, () => {
      console.log(`Backend server running on port ${PORT}`);
      console.log(`API Documentation: http://localhost:${PORT}/api/docs`);
    });
  } catch (error) {
    console.error('Failed to start backend:', error.message);
    process.exit(1);
  }
};

startServer();

export default app;
