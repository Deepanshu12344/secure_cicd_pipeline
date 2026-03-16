import { useMemo, useState } from 'react'
import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Line, LineChart, Pie, PieChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { facultyDashboardApi, facultyReportUrl } from '../services/facultyApi'

const COLORS = ['#1f75cb', '#108548', '#fc6d26', '#be123c', '#6e49cb', '#666666']

function buildVulnerabilityRows(submissions) {
  const totals = {}
  submissions.forEach((submission) => {
    const vulnerabilities = submission.vulnerabilities || {}
    Object.entries(vulnerabilities).forEach(([key, value]) => {
      const numeric = typeof value === 'number' ? value : Number(value) || 0
      totals[key] = (totals[key] || 0) + numeric
    })
  })

  return Object.entries(totals).map(([name, value]) => ({ name, value }))
}

export default function FacultyStudentDetail({ studentId }) {
  const { id: routeStudentId } = useParams()
  const id = studentId || routeStudentId
  const [student, setStudent] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [error, setError] = useState('')
  const [gradeInput, setGradeInput] = useState({})
  const [feedbackInput, setFeedbackInput] = useState({})

  const loadData = async () => {
    try {
      const response = await facultyDashboardApi.getStudent(id)
      setStudent(response.data?.data?.student || null)
      setSubmissions(response.data?.data?.submissions || [])
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load student details')
    }
  }

  useEffect(() => {
    loadData()
  }, [id])

  const riskTrendData = submissions.map((item) => ({
    timestamp: new Date(item.timestamp).toLocaleDateString(),
    risk: item.risk_score
  }))

  const vulnerabilityRows = useMemo(() => buildVulnerabilityRows(submissions), [submissions])

  const submitGrade = async (submissionId) => {
    await facultyDashboardApi.assignGrade({
      submission_id: submissionId,
      faculty_grade: gradeInput[submissionId] || undefined,
      faculty_feedback: feedbackInput[submissionId] || ''
    })
    await loadData()
  }

  if (error) {
    return <div className="min-h-screen bg-[#fbfbfb] p-6 text-[#be123c]">{error}</div>
  }

  return (
    <div className="min-h-screen bg-[#fbfbfb] p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-normal text-[#303030]">{student?.name || id}</h1>
        <p className="text-sm text-[#666] mb-6">Repo: {student?.github_repo}</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white border border-gray-200 rounded p-4 h-[320px]">
            <h2 className="text-sm font-semibold text-[#303030] mb-3">Risk Trend</h2>
            <ResponsiveContainer width="100%" height="90%">
              <LineChart data={riskTrendData}>
                <XAxis dataKey="timestamp" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="risk" stroke="#1f75cb" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white border border-gray-200 rounded p-4 h-[320px]">
            <h2 className="text-sm font-semibold text-[#303030] mb-3">Vulnerability Breakdown</h2>
            <ResponsiveContainer width="100%" height="90%">
              <PieChart>
                <Pie data={vulnerabilityRows} dataKey="value" nameKey="name" outerRadius={95}>
                  {vulnerabilityRows.map((entry, index) => (
                    <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-4">
          {submissions
            .slice()
            .reverse()
            .map((submission) => (
              <div key={submission.id} className="bg-white border border-gray-200 rounded p-4">
                <div className="flex flex-wrap justify-between gap-3 mb-3">
                  <div>
                    <p className="text-sm text-[#666]">Commit</p>
                    <p className="font-mono text-xs text-[#303030]">{submission.commit_hash}</p>
                  </div>
                  <div>
                    <p className="text-sm text-[#666]">Risk Score</p>
                    <p className="font-medium text-[#303030]">{submission.risk_score}</p>
                  </div>
                  <div>
                    <p className="text-sm text-[#666]">Auto Grade</p>
                    <p className="font-medium text-[#303030]">{submission.auto_grade}</p>
                  </div>
                  <div>
                    <p className="text-sm text-[#666]">Faculty Grade</p>
                    <p className="font-medium text-[#303030]">{submission.faculty_grade || '-'}</p>
                  </div>
                </div>

                {submission.report_file_url ? (
                  <iframe
                    title={`report-${submission.id}`}
                    src={facultyReportUrl(submission.id)}
                    className="w-full h-72 border border-gray-200 rounded mb-4"
                  />
                ) : (
                  <p className="text-sm text-[#666] mb-4">No PDF report attached for this submission.</p>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <select
                    className="border border-gray-300 rounded px-3 py-2 text-sm text-[#303030] focus:outline-none focus:ring-2 focus:ring-[#1f75cb]"
                    value={gradeInput[submission.id] || ''}
                    onChange={(e) =>
                      setGradeInput((prev) => ({
                        ...prev,
                        [submission.id]: e.target.value
                      }))
                    }
                  >
                    <option value="">Use auto grade</option>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                    <option value="Fail">Fail</option>
                  </select>

                  <input
                    type="text"
                    className="border border-gray-300 rounded px-3 py-2 text-sm text-[#303030] focus:outline-none focus:ring-2 focus:ring-[#1f75cb]"
                    placeholder="Faculty feedback"
                    value={feedbackInput[submission.id] || ''}
                    onChange={(e) =>
                      setFeedbackInput((prev) => ({
                        ...prev,
                        [submission.id]: e.target.value
                      }))
                    }
                  />

                  <button
                    type="button"
                    onClick={() => submitGrade(submission.id)}
                    className="bg-[#1f75cb] text-white rounded px-4 py-2 text-sm hover:bg-[#1068bf]"
                  >
                    Save grade
                  </button>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}
