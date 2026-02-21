import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Github } from 'lucide-react'
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

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const githubStatus = params.get('github')
    const tokenFromGithub = params.get('token')
    const nextPath = params.get('next')

    if (!githubStatus && !tokenFromGithub) {
      return
    }

    if (!tokenFromGithub) {
      if (githubStatus === 'config_missing') {
        setError('GitHub sign in is not configured on the server.')
      } else if (githubStatus === 'email_unverified') {
        setError('GitHub account email is not verified. Verify it and try again.')
      } else if (githubStatus === 'account_conflict') {
        setError('This GitHub account is already linked to another user.')
      } else if (githubStatus === 'oauth_expired') {
        setError('GitHub sign in session expired. Please try again.')
      } else if (githubStatus === 'oauth_failed') {
        setError('GitHub sign in failed. Please try again.')
      }
      return
    }

    let mounted = true
    setError('')
    setLoading(true)

    authApi
      .meWithToken(tokenFromGithub)
      .then((response) => {
        if (!mounted) {
          return
        }
        login(response.data.data.user, tokenFromGithub)
        const destination =
          typeof nextPath === 'string' && nextPath.startsWith('/') ? nextPath : from
        navigate(destination, { replace: true })
      })
      .catch(() => {
        if (mounted) {
          setError('GitHub sign in succeeded but session initialization failed.')
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false)
        }
      })

    return () => {
      mounted = false
    }
  }, [location.search, from, login, navigate])

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
        // Manual login/register still works.
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

      const lastGoogleEmail = sessionStorage.getItem('lastGoogleEmail')
      if (lastGoogleEmail) {
        window.google.accounts.id.revoke(lastGoogleEmail, () => {})
        sessionStorage.removeItem('lastGoogleEmail')
      }
      window.google.accounts.id.disableAutoSelect()

      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleGoogleCredential,
        auto_select: false
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
    <div className="min-h-screen bg-[#f7f7f7] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded p-7">
        <div className="mb-6">
          <h1 className="text-2xl font-normal text-[#303030]">Secure CI/CD</h1>
          <p className="text-sm text-[#666] mt-1">{isRegister ? 'Create your account' : 'Sign in to continue'}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister ? (
            <div>
              <label htmlFor="name" className="block text-sm text-[#303030] mb-1">Name</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded border border-gray-300 px-3 py-2 text-[#303030] focus:outline-none focus:ring-2 focus:ring-[#1f75cb]"
                placeholder="Your name"
              />
            </div>
          ) : null}

          <div>
            <label htmlFor="email" className="block text-sm text-[#303030] mb-1">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded border border-gray-300 px-3 py-2 text-[#303030] focus:outline-none focus:ring-2 focus:ring-[#1f75cb]"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm text-[#303030] mb-1">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded border border-gray-300 px-3 py-2 text-[#303030] focus:outline-none focus:ring-2 focus:ring-[#1f75cb]"
              placeholder={isRegister ? 'At least 6 characters' : 'Enter your password'}
            />
          </div>

          {error ? <p className="text-sm text-[#be123c]">{error}</p> : null}

          <button
            type="submit"
            className="w-full px-4 py-2 bg-[#1f75cb] text-white rounded text-sm font-medium hover:bg-[#1068bf] disabled:opacity-70"
            disabled={loading}
          >
            {loading ? 'Please wait...' : isRegister ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <button
          type="button"
          className="w-full mt-4 text-sm text-[#1f75cb] hover:text-[#1068bf]"
          onClick={() => {
            setMode(isRegister ? 'login' : 'register')
            setError('')
          }}
        >
          {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Register"}
        </button>

        <div className="mt-6 pt-5 border-t border-gray-200">
          <button
            type="button"
            onClick={() => {
              window.location.href = authApi.getGithubLoginUrl(from)
            }}
            className="w-full max-w-[320px] mx-auto h-10 flex items-center justify-center gap-2 px-4 border border-gray-300 rounded text-sm font-medium text-[#24292f] bg-white hover:bg-gray-50 disabled:opacity-70"
            disabled={loading}
          >
            <Github className="w-4 h-4" />
            <span>Sign in with GitHub</span>
          </button>
          {googleClientId ? (
            <>
              <p className="text-sm text-[#666] text-center my-3">Or continue with Google</p>
              <div className="flex justify-center" ref={googleButtonRef}></div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
