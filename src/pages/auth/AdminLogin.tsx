import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, Lock, Eye, EyeOff, ShieldCheck, ArrowLeft, Shield } from 'lucide-react'
import { MediHawkLogo } from '@/components/ui/MediHawkLogo'
import { useStore } from '@/store'
import { useToast } from '@/components/ui/Toast'

export function AdminLogin() {
  const [email, setEmail] = useState('arjun.patel@medihawk.in')
  const [password, setPassword] = useState('••••••••')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const { login } = useStore()
  const navigate = useNavigate()
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    await new Promise((r) => setTimeout(r, 900))
    login('admin')
    toast('success', 'Access Granted · Command Center', 'Administrator authenticated')
    navigate('/admin')
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'transparent' }}>
      {/* Subtle crimson glow for admin portal */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(198,40,50,0.05) 0%, transparent 70%)' }} />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm relative z-10"
      >
        <button onClick={() => navigate('/')} className="btn-ghost text-xs mb-6 pl-0">
          <ArrowLeft size={13} />
          Back to home
        </button>

        <div className="panel p-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(198,40,50,0.09)', border: '1px solid rgba(198,40,50,0.20)' }}>
              <Shield size={18} className="text-crimson" />
            </div>
            <div>
              <h1 className="text-base font-bold text-text-primary">ADMIN ACCESS</h1>
              <p className="text-2xs text-text-muted tracking-widest uppercase">MediHawk Command Center</p>
            </div>
          </div>

          <MediHawkLogo size="sm" className="mb-5" />

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-text-secondary font-medium">Email Address</label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded text-sm outline-none transition-all"
                  style={{ background: 'rgba(243,247,249,0.92)', border: '1px solid rgba(23,35,43,0.12)', color: '#17232B' }}
                  onFocus={e => { e.target.style.borderColor = 'rgba(198,40,50,0.40)'; e.target.style.boxShadow = '0 0 0 3px rgba(198,40,50,0.07)'; }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(23,35,43,0.12)'; e.target.style.boxShadow = ''; }}
                  placeholder="admin@medihawk.in"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-text-secondary font-medium">Password</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-10 py-2.5 rounded text-sm outline-none transition-all"
                  style={{ background: 'rgba(243,247,249,0.92)', border: '1px solid rgba(23,35,43,0.12)', color: '#17232B' }}
                  onFocus={e => { e.target.style.borderColor = 'rgba(198,40,50,0.40)'; e.target.style.boxShadow = '0 0 0 3px rgba(198,40,50,0.07)'; }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(23,35,43,0.12)'; e.target.style.boxShadow = ''; }}
                  placeholder="Password"
                />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary">
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary mt-2 w-full">
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Verifying access...
                </span>
              ) : 'Enter Command Center'}
            </button>
          </form>

          <div className="mt-6 flex items-center gap-2 px-3 py-2 rounded"
            style={{ background: 'rgba(198,40,50,0.05)', border: '1px solid rgba(198,40,50,0.16)' }}>
            <ShieldCheck size={13} className="text-crimson flex-shrink-0" />
            <span className="text-2xs text-text-muted">Secure Medical Operations Network · Restricted Access</span>
          </div>

          <div className="mt-4 text-center">
            <button onClick={() => navigate('/auth/doctor')} className="text-xs text-text-muted hover:text-text-secondary transition-colors">
              Doctor Login →
            </button>
          </div>
        </div>

        <p className="text-center text-2xs text-text-muted mt-4">
          Demo Mode · Any credentials will authenticate
        </p>
      </motion.div>
    </div>
  )
}
