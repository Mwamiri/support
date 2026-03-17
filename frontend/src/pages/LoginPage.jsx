import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { Wrench, Eye, EyeOff, Loader2 } from 'lucide-react'
import { Toaster } from 'react-hot-toast'
import { useSettings } from '../context/SettingsContext'

export default function LoginPage() {
  const { login }  = useAuth()
  const { settings } = useSettings()
  const navigate   = useNavigate()
  const [form, setForm]       = useState({ email: '', password: '' })
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async e => {
    e.preventDefault()
    setLoading(true)
    try {
      const user = await login(form.email, form.password)
      toast.success(`Welcome, ${user.name}!`)
      navigate(user.role === 'client' ? '/client' : '/dashboard', { replace: true })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid email or password')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <Toaster position="top-right" />
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-xl shadow-blue-600/30">
            <Wrench className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">{settings.site_name || 'IT Support'}</h1>
          <p className="text-slate-400 text-sm mt-1">{settings.site_tagline || 'Maintenance & Support Management'}</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">{settings.login_title || 'Sign in to your account'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email address</label>
              <input
                type="email" required autoFocus
                className="input"
                placeholder="you@example.com"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'} required
                  className="input pr-10"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                />
                <button type="button"
                  onClick={() => setShowPwd(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          {/* Demo credentials */}
          <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <p className="text-xs font-semibold text-slate-600 mb-2.5">Demo accounts (password: <code className="bg-slate-200 px-1 rounded">password</code>)</p>
            <div className="space-y-1.5 text-xs">
              {[
                ['Super Admin', 'admin@itsupport.local'],
                ['Manager',    'manager@itsupport.local'],
                ['Technician', 'tech@itsupport.local'],
                ['Client',     'client@itsupport.local'],
              ].map(([role, email]) => (
                <button key={email}
                  onClick={() => setForm({ email, password: 'password' })}
                  className="w-full flex justify-between items-center px-3 py-1.5 rounded-lg hover:bg-white text-left transition-colors border border-transparent hover:border-slate-200">
                  <span className="text-slate-500">{role}</span>
                  <span className="text-blue-600 font-medium">{email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="text-center text-slate-500 text-xs mt-6">
          © {new Date().getFullYear()} Mwamiri IT Support System
        </p>
      </div>
    </div>
  )
}
