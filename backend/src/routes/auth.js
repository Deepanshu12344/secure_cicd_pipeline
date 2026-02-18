import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { OAuth2Client } from 'google-auth-library';
import '../config/env.js';
import User from '../models/User.js';

const router = express.Router();
const googleClient = new OAuth2Client();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRE = process.env.JWT_EXPIRE || '7d';

const sanitizeUser = (user) => ({
  id: String(user._id),
  email: user.email,
  name: user.name,
  role: user.role
});

const createToken = (user) =>
  jwt.sign(
    {
      id: String(user._id),
      sub: String(user._id),
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRE }
  );

const isDbConnected = () => mongoose.connection.readyState === 1;

const requireDbConnection = (res) => {
  if (isDbConnected()) {
    return false;
  }

  res.status(503).json({
    success: false,
    error: 'Authentication service is unavailable. Check MongoDB connection.'
  });
  return true;
};

const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

const authenticateToken = async (req, res, next) => {
  if (requireDbConnection(res)) {
    return;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Authentication token is required'
    });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.sub);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication token'
      });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired authentication token'
    });
  }
};

router.post('/login', asyncHandler(async (req, res) => {
  if (requireDbConnection(res)) {
    return;
  }

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password are required'
    });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'Invalid email or password'
    });
  }

  if (!user.passwordHash) {
    return res.status(401).json({
      success: false,
      error: 'This account uses Google sign in. Please continue with Google.'
    });
  }

  const isValidPassword = await bcrypt.compare(password, user.passwordHash);

  if (!isValidPassword) {
    return res.status(401).json({
      success: false,
      error: 'Invalid email or password'
    });
  }

  const token = createToken(user);

  return res.json({
    success: true,
    data: {
      token,
      user: sanitizeUser(user)
    }
  });
}));

router.post('/register', asyncHandler(async (req, res) => {
  if (requireDbConnection(res)) {
    return;
  }

  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({
      success: false,
      error: 'Email, password, and name are required'
    });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const trimmedName = String(name).trim();

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      error: 'Password must be at least 6 characters long'
    });
  }

  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    return res.status(409).json({
      success: false,
      error: 'User with this email already exists'
    });
  }

  const newUser = await User.create({
    email: normalizedEmail,
    name: trimmedName,
    role: 'user',
    passwordHash: await bcrypt.hash(password, 10),
    provider: 'local'
  });

  const token = createToken(newUser);

  return res.status(201).json({
    success: true,
    message: 'User registered successfully',
    data: {
      token,
      user: sanitizeUser(newUser)
    }
  });
}));

router.post('/google', asyncHandler(async (req, res) => {
  if (requireDbConnection(res)) {
    return;
  }

  const { credential, clientId } = req.body;

  if (!credential) {
    return res.status(400).json({
      success: false,
      error: 'Google credential token is required'
    });
  }

  const configuredAudiences = (process.env.GOOGLE_CLIENT_ID || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const requestAudience = typeof clientId === 'string' ? clientId.trim() : '';
  const audiences = [...new Set([...configuredAudiences, ...(requestAudience ? [requestAudience] : [])])];

  if (audiences.length === 0) {
    return res.status(500).json({
      success: false,
      error: 'Google auth is not configured. Set GOOGLE_CLIENT_ID in backend .env.'
    });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: audiences
    });

    const payload = ticket.getPayload();
    const email = payload?.email;

    if (!email) {
      return res.status(401).json({
        success: false,
        error: 'Unable to verify Google account email'
      });
    }

    const normalizedEmail = email.toLowerCase();
    const googleId = payload?.sub || null;
    let user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      user = await User.create({
        email: normalizedEmail,
        name: payload.name || normalizedEmail.split('@')[0],
        role: 'user',
        passwordHash: null,
        provider: 'google',
        googleId
      });
    } else if (googleId && user.googleId !== googleId) {
      user.googleId = googleId;
      if (user.provider !== 'local') {
        user.provider = 'google';
      }
      await user.save();
    }

    const token = createToken(user);

    return res.json({
      success: true,
      data: {
        token,
        user: sanitizeUser(user)
      }
    });
  } catch {
    return res.status(401).json({
      success: false,
      error: 'Invalid Google credential token'
    });
  }
}));

router.get('/google/client-id', (req, res) => {
  const clientId = (process.env.GOOGLE_CLIENT_ID || '')
    .split(',')
    .map((id) => id.trim())
    .find(Boolean);

  res.json({
    success: true,
    data: {
      clientId: clientId || null
    }
  });
});

router.get('/me', authenticateToken, (req, res) => {
  return res.json({
    success: true,
    data: {
      user: sanitizeUser(req.user)
    }
  });
});

router.post('/logout', (req, res) => {
  if (req.session) {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    });
    return;
  }

  res.clearCookie('connect.sid');
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

export default router;
