import axios from 'axios'

const configuredApiBase = String(import.meta.env.VITE_API_URL || '').trim()
const browserDefaultApiBase =
  typeof window !== 'undefined' ? `${window.location.origin}/api` : 'http://localhost:5000/api'

export const API_BASE = configuredApiBase || browserDefaultApiBase

const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Add token to requests
apiClient.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export const projectsApi = {
  getAll: () => apiClient.get('/projects'),
  getById: (id) => apiClient.get(`/projects/${id}`),
  create: (data) => apiClient.post('/projects', data),
  importGithub: (repo) => apiClient.post('/projects/import/github', { repo }),
  update: (id, data) => apiClient.patch(`/projects/${id}`, data),
  delete: (id) => apiClient.delete(`/projects/${id}`)
}

export const scansApi = {
  getAll: (params) => apiClient.get('/scans', { params }),
  getById: (id) => apiClient.get(`/scans/${id}`),
  create: (data) => apiClient.post('/scans', data),
  run: (id) => apiClient.post(`/scans/${id}/run`),
  deleteFailed: () => apiClient.delete('/scans/failed'),
  downloadReport: (id, type = 'pdf') =>
    apiClient.get(`/scans/${id}/report`, { params: { type }, responseType: 'blob' }),
  update: (id, data) => apiClient.patch(`/scans/${id}`, data),
  delete: (id) => apiClient.delete(`/scans/${id}`),
  getExplanation: (id) => apiClient.get(`/scans/${id}/explain`)
}

export const risksApi = {
  getAll: (params) => apiClient.get('/risks', { params }),
  getById: (id) => apiClient.get(`/risks/${id}`),
  getDetail: (id) => apiClient.get(`/risks/${id}/details`),
  getProjectDetail: (projectId) => apiClient.get(`/risks/project/${projectId}/details`),
  create: (data) => apiClient.post('/risks', data),
  syncFromScan: (data) => apiClient.post('/risks/sync-from-scan', data),
  update: (id, data) => apiClient.patch(`/risks/${id}`, data),
  submitFeedback: (id, data) => apiClient.post(`/risks/${id}/feedback`, data),
  deleteFeedback: (id) => apiClient.delete(`/risks/${id}/feedback`),
  submitBulkFeedback: (items) => apiClient.post('/risks/feedback/bulk', { items }),
  getHistory: (id) => apiClient.get(`/risks/${id}/history`),
  getExplanation: (id) => apiClient.get(`/risks/${id}/explain`),
  submitWaiver: (id, data) => apiClient.post(`/risks/${id}/waiver`, data),
  deleteWaiver: (id) => apiClient.delete(`/risks/${id}/waiver`)
}

export const mlApi = {
  getInfo: () => apiClient.get('/ml/info'),
  retrain: (data = {}) => apiClient.post('/ml/retrain', data),
  rollback: (data) => apiClient.post('/ml/rollback', data)
}

export const dashboardApi = {
  getMetrics: () => apiClient.get('/dashboard'),
  getRiskTrends: () => apiClient.get('/dashboard/risks/trend'),
  getScanStats: () => apiClient.get('/dashboard/scans/stats'),
  getVulnerabilities: () => apiClient.get('/dashboard/vulnerabilities/types'),
  getModelMetrics: () => apiClient.get('/dashboard/model/metrics')
}

export const pipelinesApi = {
  getAll: () => apiClient.get('/pipelines'),
  getById: (id) => apiClient.get(`/pipelines/${id}`),
  getReportContent: (id) => apiClient.get(`/pipelines/${id}/report-content`),
  create: (data) => apiClient.post('/pipelines', data),
  runScan: (id, data = {}) => apiClient.post(`/pipelines/${id}/scan`, data),
  downloadReport: (id, type = 'pdf') =>
    apiClient.get(`/pipelines/${id}/report`, { params: { type }, responseType: 'blob' }),
  update: (id, data) => apiClient.patch(`/pipelines/${id}`, data)
}

export const authApi = {
  login: (data) => apiClient.post('/auth/login', data),
  register: (data) => apiClient.post('/auth/register', data),
  me: () => apiClient.get('/auth/me'),
  meWithToken: (token) =>
    apiClient.get('/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    }),
  getGithubLoginUrl: (redirectPath = '/') =>
    `${API_BASE}/auth/github/login?redirect=${encodeURIComponent(redirectPath)}`,
  uploadProfilePhoto: (formData) =>
    apiClient.post('/auth/profile-photo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
  getGoogleClientId: () => apiClient.get('/auth/google/client-id'),
  googleLogin: (data) => apiClient.post('/auth/google', data),
  logout: () => apiClient.post('/auth/logout')
}

export const githubApi = {
  getConnectUrl: (token) => `${API_BASE}/github/connect?token=${encodeURIComponent(token)}`,
  getStatus: () => apiClient.get('/github/status'),
  getRepos: () => apiClient.get('/github/repos')
}

export default apiClient
