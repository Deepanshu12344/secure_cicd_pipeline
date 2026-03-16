import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { facultyDashboardApi } from '../services/facultyApi'
import { useFacultyAuthStore } from '../store/facultyAuth'

export default function FacultyStudents() {
  const user = useFacultyAuthStore((state) => state.user)
  const logout = useFacultyAuthStore((state) => state.logout)
  const [students, setStudents] = useState([])
  const [summary, setSummary] = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const [studentsRes, summaryRes, leaderboardRes] = await Promise.all([
          facultyDashboardApi.getStudents(),
          facultyDashboardApi.getClassSummary(),
          facultyDashboardApi.getLeaderboard()
        ])
        setStudents(studentsRes.data?.data?.students || [])
        setSummary(summaryRes.data?.data || null)
        setLeaderboard(leaderboardRes.data?.data?.leaderboard || [])
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to load dashboard')
      }
    }

    load()
  }, [])

  const handleExportCsv = async () => {
    const response = await facultyDashboardApi.exportCsv()
    const blobUrl = URL.createObjectURL(new Blob([response.data], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = 'faculty-grades.csv'
    a.click()
    URL.revokeObjectURL(blobUrl)
  }

  return (
    <div className="min-h-screen bg-[#fbfbfb] p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-normal text-[#303030]">Faculty Dashboard</h1>
            <p className="text-sm text-[#666]">Welcome, {user?.name}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleExportCsv} className="px-3 py-2 rounded border border-gray-300 text-sm text-[#303030] hover:bg-gray-50">
              Export CSV
            </button>
            <button onClick={logout} className="px-3 py-2 rounded bg-[#1f75cb] text-white text-sm hover:bg-[#1068bf]">
              Logout
            </button>
          </div>
        </div>

        {summary ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white border border-gray-200 rounded p-4">
              <p className="text-sm text-[#666]">Total Submissions</p>
              <p className="text-2xl font-normal text-[#303030]">{summary.total_submissions}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded p-4">
              <p className="text-sm text-[#666]">Average Risk Score</p>
              <p className="text-2xl font-normal text-[#303030]">{summary.average_risk_score}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded p-4">
              <p className="text-sm text-[#666]">Top Secure Student</p>
              <p className="text-lg font-medium text-[#303030]">{leaderboard[0]?.name || 'N/A'}</p>
            </div>
          </div>
        ) : null}

        {error ? <p className="text-sm text-[#be123c] mb-3">{error}</p> : null}

        <div className="bg-white border border-gray-200 rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#f0f0f0] text-left">
              <tr>
                <th className="px-4 py-3">Student ID</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Repo</th>
                <th className="px-4 py-3">Latest Risk</th>
                <th className="px-4 py-3">Auto Grade</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.student_id} className="border-t border-gray-200">
                  <td className="px-4 py-3 text-[#303030]">{student.student_id}</td>
                  <td className="px-4 py-3 text-[#303030]">{student.name}</td>
                  <td className="px-4 py-3 text-[#303030]">{student.github_repo}</td>
                  <td className="px-4 py-3 text-[#303030]">{student.latest_risk_score ?? '-'}</td>
                  <td className="px-4 py-3 text-[#303030]">{student.latest_auto_grade ?? '-'}</td>
                  <td className="px-4 py-3">
                    <Link
                      className="text-[#1f75cb] hover:underline"
                      to={`/faculty/student/${student.student_id}`}
                    >
                      View details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
