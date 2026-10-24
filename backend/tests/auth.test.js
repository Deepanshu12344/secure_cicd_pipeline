import { beforeAll, describe, expect, it } from '@jest/globals'
import fs from 'fs'
import request from 'supertest'

let app

beforeAll(async () => {
  process.env.MONGODB_URI = 'disabled'
  process.env.SKIP_MONGO = '1'
  process.env.FRONTEND_URL = 'http://localhost:3000'
  process.env.NODE_ENV = 'test'

  const originalMkdirSync = fs.mkdirSync
  fs.mkdirSync = () => {
    throw new Error('The deployment filesystem is read-only')
  }

  try {
    ({ default: app } = await import('../src/index.js'))
  } finally {
    fs.mkdirSync = originalMkdirSync
  }
})

describe('GitHub authentication', () => {
  it('loads and redirects safely when the deployment filesystem is read-only', async () => {
    const response = await request(app).get('/api/auth/github/login?redirect=%2F')

    expect(response.status).toBe(302)
    expect(response.headers.location).toBe('http://localhost:3000/login?github=db_unavailable')
  })
})
