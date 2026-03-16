import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { facultyAuthApi } from '../services/facultyApi'
import { useFacultyAuthStore } from '../store/facultyAuth'

export default function FacultyLogin() {
  const navigate = useNavigate()
  const location = useLocation()
  const login = useFacultyAuthStore((state) => state.login)
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [institution, setInstitution] = useState('')
  const [email, setEmail] = useState('faculty@example.com')
  const [password, setPassword] = useState('faculty123')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const from = location.state?.from?.pathname

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response =
        mode === 'register'
          ? await facultyAuthApi.registerFaculty({ name, institution, email, password })
          : await facultyAuthApi.login({ email, password })
      login(response.data.data.user, response.data.data.token)

      if (response.data.data.user.role === 'faculty') {
        navigate(from || '/faculty/students', { replace: true })
      } else {
        navigate('/student/reports', { replace: true })
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to sign in')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f7f7] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded p-7">
        <h1 className="text-2xl font-normal text-[#303030]">Faculty Evaluation Portal</h1>
        <p className="text-sm text-[#666] mt-1">
          {mode === 'register' ? 'Create a faculty account' : 'Faculty and students can sign in here.'}
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          {mode === 'register' ? (
            <>
              <div>
                <label className="block text-sm text-[#303030] mb-1" htmlFor="faculty-name">
                  Full Name
                </label>
                <input
                  id="faculty-name"
                  type="text"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-[#303030] focus:outline-none focus:ring-2 focus:ring-[#1f75cb]"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-[#303030] mb-1" htmlFor="faculty-institution">
                  Institution
                </label>
                <input
                  id="faculty-institution"
                  type="text"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-[#303030] focus:outline-none focus:ring-2 focus:ring-[#1f75cb]"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                />
              </div>
            </>
          ) : null}

          <div>
            <label className="block text-sm text-[#303030] mb-1" htmlFor="faculty-email">
              Email
            </label>
            <input
              id="faculty-email"
              type="email"
              className="w-full rounded border border-gray-300 px-3 py-2 text-[#303030] focus:outline-none focus:ring-2 focus:ring-[#1f75cb]"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm text-[#303030] mb-1" htmlFor="faculty-password">
              Password
            </label>
            <input
              id="faculty-password"
              type="password"
              className="w-full rounded border border-gray-300 px-3 py-2 text-[#303030] focus:outline-none focus:ring-2 focus:ring-[#1f75cb]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>

          {error ? <p className="text-sm text-[#be123c]">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-[#1f75cb] text-white rounded text-sm font-medium hover:bg-[#1068bf] disabled:opacity-70"
          >
            {loading ? 'Please wait...' : mode === 'register' ? 'Create faculty account' : 'Sign in'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setError('')
            setMode(mode === 'register' ? 'login' : 'register')
          }}
          className="mt-4 w-full text-sm text-[#1f75cb] hover:text-[#1068bf]"
        >
          {mode === 'register' ? 'Already have an account? Sign in' : 'New faculty? Create account'}
        </button>
      </div>
    </div>
  )
}
