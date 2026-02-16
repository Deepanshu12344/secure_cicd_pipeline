import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
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
  update: (id, data) => apiClient.patch(`/projects/${id}`, data),
  delete: (id) => apiClient.delete(`/projects/${id}`)
}

export const scansApi = {
  getAll: () => apiClient.get('/scans'),
  getById: (id) => apiClient.get(`/scans/${id}`),
  create: (data) => apiClient.post('/scans', data),
  update: (id, data) => apiClient.patch(`/scans/${id}`, data),
  delete: (id) => apiClient.delete(`/scans/${id}`)
}

export const risksApi = {
  getAll: (params) => apiClient.get('/risks', { params }),
  getById: (id) => apiClient.get(`/risks/${id}`),
  create: (data) => apiClient.post('/risks', data),
  update: (id, data) => apiClient.patch(`/risks/${id}`, data)
}

export const dashboardApi = {
  getMetrics: () => apiClient.get('/dashboard'),
  getRiskTrends: () => apiClient.get('/dashboard/risks/trend'),
  getScanStats: () => apiClient.get('/dashboard/scans/stats'),
  getVulnerabilities: () => apiClient.get('/dashboard/vulnerabilities/types')
}

export const pipelinesApi = {
  getAll: () => apiClient.get('/pipelines'),
  getById: (id) => apiClient.get(`/pipelines/${id}`),
  create: (data) => apiClient.post('/pipelines', data),
  update: (id, data) => apiClient.patch(`/pipelines/${id}`, data)
}

export const authApi = {
  login: (data) => apiClient.post('/auth/login', data),
  register: (data) => apiClient.post('/auth/register', data),
  me: () => apiClient.get('/auth/me'),
  getGoogleClientId: () => apiClient.get('/auth/google/client-id'),
  googleLogin: (data) => apiClient.post('/auth/google', data),
  logout: () => apiClient.post('/auth/logout')
}

export default apiClient
