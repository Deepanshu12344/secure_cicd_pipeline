import express from 'express';
import crypto from 'crypto';
import axios from 'axios';
import { FRONTEND_URL } from '../config/env.js';
import User from '../models/User.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

const getCallbackUrl = () =>
  process.env.GITHUB_CALLBACK_URL || 'http://localhost:5000/api/auth/github/callback';

router.get('/auth/github', protect, (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.redirect(`${FRONTEND_URL}/projects?github=config_missing`);
  }

  const state = crypto.randomBytes(24).toString('hex');
  req.session.githubOAuth = {
    state,
    userId: req.user.id,
    createdAt: Date.now()
  };

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getCallbackUrl(),
    scope: 'repo',
    state
  });

  return res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

router.get('/auth/github/callback', async (req, res) => {
  const { code, state } = req.query;
  const oauthSession = req.session.githubOAuth;

  if (!code || !state || !oauthSession?.state || state !== oauthSession.state) {
    return res.redirect(`${FRONTEND_URL}/projects?github=link_failed`);
  }

  try {
    const tokenResponse = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: getCallbackUrl(),
        state
      },
      {
        headers: {
          Accept: 'application/json'
        },
        timeout: 10000
      }
    );

    const accessToken = tokenResponse.data?.access_token;
    if (!accessToken) {
      console.error('GitHub token exchange failed:', tokenResponse.data);
      return res.redirect(`${FRONTEND_URL}/projects?github=link_failed`);
    }

    const profileResponse = await axios.get('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'secure-cicd-app',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      timeout: 10000
    });

    const githubId = String(profileResponse.data?.id || '');
    if (!githubId) {
      console.error('GitHub profile fetch returned no id');
      return res.redirect(`${FRONTEND_URL}/projects?github=link_failed`);
    }

    await User.findByIdAndUpdate(oauthSession.userId, {
      githubId,
      githubAccessToken: accessToken
    });

    delete req.session.githubOAuth;
    return res.redirect(`${FRONTEND_URL}/projects?github=connected`);
  } catch (error) {
    const details = error?.response?.data || error?.message || error;
    console.error('GitHub OAuth callback error:', details);
    return res.redirect(`${FRONTEND_URL}/projects?github=link_failed`);
  }
});

router.get('/github/status', protect, async (req, res) => {
  const user = await User.findById(req.user.id).select('githubId githubAccessToken');
  res.json({
    success: true,
    data: {
      connected: Boolean(user?.githubAccessToken),
      githubId: user?.githubId || null
    }
  });
});

router.get('/github/repos', protect, async (req, res) => {
  const user = await User.findById(req.user.id).select('githubAccessToken');

  if (!user?.githubAccessToken) {
    return res.status(400).json({ success: false, message: 'GitHub not connected' });
  }

  try {
    const response = await axios.get('https://api.github.com/user/repos', {
      headers: {
        Authorization: `Bearer ${user.githubAccessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'secure-cicd-app',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      params: {
        sort: 'updated',
        per_page: 100
      }
    });

    const repos = response.data.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      htmlUrl: repo.html_url,
      private: repo.private,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      description: repo.description || '',
      language: repo.language || 'unknown',
      owner: repo.owner?.login || ''
    }));

    return res.json({ success: true, count: repos.length, data: repos });
  } catch (error) {
    const status = error?.response?.status || 500;
    const message =
      status === 401
        ? 'GitHub token expired or invalid. Reconnect GitHub.'
        : 'Failed to fetch GitHub repositories';

    return res.status(status).json({ success: false, message });
  }
});

export default router;
