import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: './.env' });
const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!uri) {
  console.error('NO_URI');
  process.exit(2);
}
try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log('MONGO_CONNECT_OK');
  await mongoose.disconnect();
  process.exit(0);
} catch (err) {
  console.error('MONGO_CONNECT_FAIL');
  console.error(err?.message || String(err));
  process.exit(1);
}
