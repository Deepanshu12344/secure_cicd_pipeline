import axios from 'axios'

export const FACULTY_API_BASE =
  import.meta.env.VITE_FACULTY_API_URL || 'http://localhost:5000/api'

const facultyClient = axios.create({
  baseURL: FACULTY_API_BASE,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json'
  }
})

facultyClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('faculty_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export const facultyAuthApi = {
  login: (data) => facultyClient.post('/auth/login', data),
  registerFaculty: (data) => facultyClient.post('/auth/register-faculty', data),
  me: () => facultyClient.get('/auth/me')
}

export const facultyDashboardApi = {
  getStudents: () => facultyClient.get('/students'),
  getStudent: (studentId) => facultyClient.get(`/student/${studentId}`),
  assignGrade: (data) => facultyClient.post('/assign-grade', data),
  getClassSummary: () => facultyClient.get('/analytics/class-summary'),
  getLeaderboard: () => facultyClient.get('/analytics/leaderboard'),
  exportCsv: () => facultyClient.get('/grades/export-csv', { responseType: 'blob' })
}

export const facultyReportUrl = (submissionId) =>
  `${FACULTY_API_BASE}/submissions/${submissionId}/report-file?token=${encodeURIComponent(localStorage.getItem('faculty_token') || '')}`

export default facultyClient
