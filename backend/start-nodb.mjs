process.env.MONGODB_URI = '';
process.env.MONGO_URI = '';
process.env.FRONTEND_URL = 'http://localhost:3000';
await import('./src/index.js');
