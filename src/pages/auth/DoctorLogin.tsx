import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Phone, Lock, Eye, EyeOff, ShieldCheck, ArrowLeft } from 'lucide-react'
import { MediHawkLogo } from '@/components/ui/MediHawkLogo'
import { useStore } from '@/store'
import { useToast } from '@/components/ui/Toast'

export function DoctorLogin() {
  const [phone, setPhone] = useState('+91-9861234567')
  const [password, setPassword] = useState('••••••••')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const { login } = useStore()
  const navigate = useNavigate()
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    await new Promise((r) => setTimeout(r, 800))
    login('doctor')
    toast('success', 'Welcome, Dr. Priya Mohanty', 'Authentication successful')
    navigate('/doctor')
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'transparent' }}>
      {/* Soft green glow for doctor portal */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(31,157,104,0.05) 0%, transparent 70%)' }} />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm relative z-10"
      >
        {/* Back */}
        <button onClick={() => navigate('/')} className="btn-ghost text-xs mb-6 pl-0">
          <ArrowLeft size={13} />
          Back to home
        </button>

        <div className="panel p-8">
          <MediHawkLogo size="md" className="mb-6" />

          <h1 className="text-xl font-bold text-text-primary mb-1">Doctor Portal</h1>
          <p className="text-sm text-text-secondary mb-6">
            Access your PHC medical delivery dashboard.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Phone */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-text-secondary font-medium">Phone / Email</label>
              <div className="relative">
                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded text-sm outline-none transition-all"
                  style={{
                    background: 'rgba(243,247,249,0.92)',
                    border: '1px solid rgba(23,35,43,0.12)',
                    color: '#17232B',
                  }}
                  onFocus={e => { e.target.style.borderColor = 'rgba(31,157,104,0.45)'; e.target.style.boxShadow = '0 0 0 3px rgba(31,157,104,0.09)'; }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(23,35,43,0.12)'; e.target.style.boxShadow = ''; }}
                  placeholder="+91 Phone or Email"
                />
              </div>
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-text-secondary font-medium">Password</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-10 py-2.5 rounded text-sm outline-none transition-all"
                  style={{
                    background: 'rgba(243,247,249,0.92)',
                    border: '1px solid rgba(23,35,43,0.12)',
                    color: '#17232B',
                  }}
                  onFocus={e => { e.target.style.borderColor = 'rgba(31,157,104,0.45)'; e.target.style.boxShadow = '0 0 0 3px rgba(31,157,104,0.09)'; }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(23,35,43,0.12)'; e.target.style.boxShadow = ''; }}
                  placeholder="Password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-green mt-2 w-full"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Authenticating...
                </span>
              ) : 'Enter Doctor Portal'}
            </button>
          </form>

          {/* Security note */}
          <div className="mt-6 flex items-center gap-2 px-3 py-2 rounded"
            style={{ background: 'rgba(31,157,104,0.06)', border: '1px solid rgba(31,157,104,0.18)' }}>
            <ShieldCheck size={13} className="text-med-green flex-shrink-0" />
            <span className="text-2xs text-text-muted">Secure Medical Operations Network · TLS 1.3 · AES-256</span>
          </div>

          <div className="mt-4 text-center">
            <button onClick={() => navigate('/auth/admin')} className="text-xs text-text-muted hover:text-text-secondary transition-colors">
              Admin Access →
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
