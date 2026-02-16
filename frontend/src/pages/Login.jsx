import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ShieldCheckIcon } from '@heroicons/react/24/outline'
import { authApi } from '../services/api'
import { useAuthStore } from '../store/auth'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const login = useAuthStore((state) => state.login)

  const googleButtonRef = useRef(null)
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [googleClientId, setGoogleClientId] = useState(import.meta.env.VITE_GOOGLE_CLIENT_ID || '')

  const from = location.state?.from?.pathname || '/'
  const isRegister = mode === 'register'

  const completeLogin = (user, token) => {
    login(user, token)
    navigate(from, { replace: true })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isRegister) {
        const response = await authApi.register({ name, email, password })
        completeLogin(response.data.data.user, response.data.data.token)
      } else {
        const response = await authApi.login({ email, password })
        completeLogin(response.data.data.user, response.data.data.token)
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to authenticate. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (googleClientId) {
      return
    }

    let mounted = true
    authApi
      .getGoogleClientId()
      .then((response) => {
        const runtimeClientId = response.data?.data?.clientId
        if (mounted && runtimeClientId) {
          setGoogleClientId(runtimeClientId)
        }
      })
      .catch(() => {
        // Ignore; manual login/register still works.
      })

    return () => {
      mounted = false
    }
  }, [googleClientId])

  useEffect(() => {
    if (!googleClientId || !googleButtonRef.current) {
      return
    }

    const handleGoogleCredential = async (response) => {
      setError('')
      setLoading(true)

      try {
        const result = await authApi.googleLogin({
          credential: response.credential,
          clientId: googleClientId
        })
        completeLogin(result.data.data.user, result.data.data.token)
      } catch (err) {
        setError(err.response?.data?.error || 'Google sign in failed.')
      } finally {
        setLoading(false)
      }
    }

    const initGoogle = () => {
      if (!window.google?.accounts?.id) {
        return
      }

      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleGoogleCredential
      })

      googleButtonRef.current.innerHTML = ''
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        type: 'standard',
        shape: 'rectangular',
        theme: 'outline',
        text: 'signin_with',
        size: 'large',
        width: 320
      })
    }

    if (window.google?.accounts?.id) {
      initGoogle()
      return
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = initGoogle
    document.body.appendChild(script)
  }, [googleClientId])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md card p-8">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-cyan-300 rounded-lg flex items-center justify-center">
            <ShieldCheckIcon className="w-6 h-6 text-slate-900" />
          </div>
          <div>
            <h1 className="text-xl font-bold gradient-text">SecureCI/CD</h1>
            <p className="text-xs text-slate-400">
              {isRegister ? 'Create your account' : 'Sign in to continue'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister ? (
            <div>
              <label htmlFor="name" className="block text-sm text-slate-300 mb-1">
                Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Your name"
              />
            </div>
          ) : null}

          <div>
            <label htmlFor="email" className="block text-sm text-slate-300 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm text-slate-300 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={isRegister ? 'At least 6 characters' : 'Enter your password'}
            />
          </div>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <button type="submit" className="w-full btn-primary disabled:opacity-70" disabled={loading}>
            {loading ? 'Please wait...' : isRegister ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <button
          type="button"
          className="w-full mt-4 text-sm text-blue-300 hover:text-blue-200"
          onClick={() => {
            setMode(isRegister ? 'login' : 'register')
            setError('')
          }}
        >
          {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Register"}
        </button>

        {googleClientId ? (
          <div className="mt-6 pt-6 border-t border-slate-700">
            <p className="text-sm text-slate-300 text-center mb-3">Or continue with Google</p>
            <div className="flex justify-center" ref={googleButtonRef}></div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
