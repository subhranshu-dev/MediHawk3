import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, Lock, Eye, EyeOff, ArrowLeft, ChevronRight, Shield, UserPlus, Key, Zap } from 'lucide-react'

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'
import { MediHawkLogo } from '@/components/ui/MediHawkLogo'
import { useStore } from '@/store'
import { useToast } from '@/components/ui/Toast'
import { authService, saveToken } from '@/services/api'

/* ── helpers ──────────────────────────────────────────────────── */
const BASE_INPUT: React.CSSProperties = {
  background: 'rgba(243,247,249,0.92)',
  border: '1px solid rgba(23,35,43,0.12)',
  color: '#17232B',
}
function applyFocus(el: HTMLInputElement) {
  el.style.borderColor = 'rgba(198,40,50,0.38)'
  el.style.boxShadow   = '0 0 0 3px rgba(198,40,50,0.08)'
}
function applyBlur(el: HTMLInputElement) {
  el.style.borderColor = 'rgba(23,35,43,0.12)'
  el.style.boxShadow   = ''
}
function validEmail(v: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) }

/* ── Spinner ──────────────────────────────────────────────────── */
function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

/* ── OTP cell grid ────────────────────────────────────────────── */
function OtpGrid({ cells, refs, onChange, onKey, onPaste, error: otpErr }: {
  cells: string[]
  refs: React.MutableRefObject<Array<HTMLInputElement | null>>
  onChange: (i: number, v: string) => void
  onKey: (i: number, e: React.KeyboardEvent) => void
  onPaste: (e: React.ClipboardEvent) => void
  error: string
}) {
  return (
    <>
      <div className="flex gap-2 justify-between mb-1" onPaste={onPaste}>
        {cells.map((cell, i) => (
          <input
            key={i}
            ref={el => { refs.current[i] = el }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={cell}
            onChange={e => onChange(i, e.target.value)}
            onKeyDown={e => onKey(i, e)}
            aria-label={`OTP digit ${i + 1}`}
            className="outline-none transition-all rounded font-bold text-center text-lg"
            style={{ ...BASE_INPUT, width: '44px', height: '52px' }}
            onFocus={e => applyFocus(e.target as HTMLInputElement)}
            onBlur={e  => applyBlur(e.target as HTMLInputElement)}
          />
        ))}
      </div>
      {otpErr && <p className="text-xs mt-1 mb-2" style={{ color: '#c62832' }}>{otpErr}</p>}
    </>
  )
}

/* ── Main component ───────────────────────────────────────────── */
type View = 'login' | 'signup' | 'verify-email' | 'fp-email' | 'fp-otp' | 'fp-newpw'

export function AdminLogin() {
  const navigate    = useNavigate()
  const { loginUser } = useStore()
  const { toast }   = useToast()

  const [view, setView] = useState<View>('login')

  // Login form
  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [showPw, setShowPw]         = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading]       = useState(false)
  const [emailErr, setEmailErr]     = useState('')
  const [pwErr, setPwErr]           = useState('')
  const [formError, setFormError]   = useState('')

  // Signup
  const [sgName, setSgName]         = useState('')
  const [sgEmail, setSgEmail]       = useState('')
  const [sgPw, setSgPw]             = useState('')
  const [sgConfPw, setSgConfPw]     = useState('')
  const [sgInvite, setSgInvite]     = useState('')
  const [sgShowPw, setSgShowPw]     = useState(false)
  const [sgLoading, setSgLoading]   = useState(false)
  const [sgError, setSgError]       = useState('')
  const [sgNameErr, setSgNameErr]   = useState('')
  const [sgEmailErr, setSgEmailErr] = useState('')
  const [sgPwErr, setSgPwErr]       = useState('')
  const [sgConfPwErr, setSgConfPwErr] = useState('')
  const [sgInviteErr, setSgInviteErr] = useState('')

  // Email verification (after signup)
  const [veEmail, setVeEmail]         = useState('')
  const [veCells, setVeCells]         = useState(['', '', '', '', '', ''])
  const [veLoading, setVeLoading]     = useState(false)
  const [veResending, setVeResending] = useState(false)
  const [veTimer, setVeTimer]         = useState(0)
  const [veError, setVeError]         = useState('')
  const veRefs    = useRef<Array<HTMLInputElement | null>>(Array(6).fill(null))
  const veTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Forgot — step 1: email
  const [fpEmail, setFpEmail]       = useState('')
  const [fpEmailErr, setFpEmailErr] = useState('')
  const [fpSending, setFpSending]   = useState(false)

  // Forgot — step 2: OTP
  const [fpOtp, setFpOtp]             = useState(['', '', '', '', '', ''])
  const [fpOtpErr, setFpOtpErr]       = useState('')
  const [fpVerifying, setFpVerifying] = useState(false)
  const [fpResending, setFpResending] = useState(false)
  const [fpTimer, setFpTimer]         = useState(0)
  const fpOtpRefs  = useRef<Array<HTMLInputElement | null>>(Array(6).fill(null))
  const fpTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Forgot — step 3: new password + reset token
  const [fpResetToken, setFpResetToken] = useState('')
  const [fpNewPw, setFpNewPw]         = useState('')
  const [fpConfPw, setFpConfPw]       = useState('')
  const [fpShowNew, setFpShowNew]     = useState(false)
  const [fpShowConf, setFpShowConf]   = useState(false)
  const [fpNewPwErr, setFpNewPwErr]   = useState('')
  const [fpConfPwErr, setFpConfPwErr] = useState('')
  const [fpResetting, setFpResetting] = useState(false)
  const [fpResetErr, setFpResetErr]   = useState('')

  useEffect(() => () => {
    if (fpTimerRef.current) clearInterval(fpTimerRef.current)
    if (veTimerRef.current) clearInterval(veTimerRef.current)
  }, [])

  const startTimer = (setter: React.Dispatch<React.SetStateAction<number>>, ref: React.MutableRefObject<ReturnType<typeof setInterval> | null>) => {
    if (ref.current) clearInterval(ref.current)
    setter(60)
    ref.current = setInterval(() => {
      setter(t => { if (t <= 1) { clearInterval(ref.current!); return 0 } return t - 1 })
    }, 1000)
  }

  /* ── Demo login ────────────────────────────────────────── */
  const handleDemoLogin = async () => {
    setLoading(true)
    setFormError('')
    try {
      const res = await authService.demoLogin('admin')
      saveToken(res.token)
      loginUser({ id: res.user.id, name: res.user.name, email: res.user.email, role: 'admin' })
      toast('success', 'Demo Access · Command Center', 'Demo administrator authenticated')
      navigate('/admin')
    } catch (err: unknown) {
      const e = err as { message?: string }
      setFormError(e.message ?? 'Demo login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  /* ── Login ─────────────────────────────────────────────── */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    let ok = true
    if (!validEmail(email)) { setEmailErr('Enter a valid email address'); ok = false } else setEmailErr('')
    if (!password)          { setPwErr('Password is required'); ok = false }          else setPwErr('')
    if (!ok) return
    setLoading(true)
    try {
      const res = await authService.login({ email, password, role: 'admin' })
      saveToken(res.token)
      loginUser({
        id: res.user.id,
        name: res.user.name,
        email: res.user.email,
        role: 'admin',
      })
      toast('success', 'Access Granted · Command Center', 'Administrator authenticated')
      navigate('/admin')
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code === 'INVALID_CREDENTIALS') {
        setFormError('Invalid email or password.')
      } else {
        setFormError('Unable to sign in. Check your credentials and try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  /* ── Signup ────────────────────────────────────────────── */
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setSgError('')
    let valid = true
    if (!sgName.trim())      { setSgNameErr('Full name is required'); valid = false }           else setSgNameErr('')
    if (!validEmail(sgEmail)) { setSgEmailErr('Enter a valid email address'); valid = false }    else setSgEmailErr('')
    if (sgPw.length < 8)     { setSgPwErr('Password must be at least 8 characters'); valid = false } else setSgPwErr('')
    if (sgConfPw !== sgPw)   { setSgConfPwErr('Passwords do not match'); valid = false }         else setSgConfPwErr('')
    if (!sgInvite.trim())    { setSgInviteErr('Invite code is required'); valid = false }        else setSgInviteErr('')
    if (!valid) return
    setSgLoading(true)
    try {
      await authService.adminSignup({
        name: sgName.trim(),
        email: sgEmail.trim().toLowerCase(),
        password: sgPw,
        invite_code: sgInvite.trim(),
      })
      setVeEmail(sgEmail.trim().toLowerCase())
      setVeCells(['', '', '', '', '', ''])
      setVeError('')
      startTimer(setVeTimer, veTimerRef)
      setView('verify-email')
      setTimeout(() => veRefs.current[0]?.focus(), 80)
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      if (e.code === 'EMAIL_EXISTS') {
        setSgEmailErr('An account with this email already exists.')
      } else if (e.code === 'INVALID_INVITE_CODE') {
        setSgInviteErr('Invalid invite code. Contact your system administrator.')
      } else if (e.code === 'SIGNUP_DISABLED') {
        setSgError('Admin self-registration is not currently enabled. Contact your administrator.')
      } else {
        setSgError(e.message ?? 'Could not create account. Please try again.')
      }
    } finally {
      setSgLoading(false)
    }
  }

  /* ── Email verification (after admin signup) ────────────── */
  const handleVeChange = (i: number, v: string) => {
    const d = v.replace(/\D/g, '').slice(-1)
    setVeCells(prev => { const n = [...prev]; n[i] = d; return n })
    if (d && i < 5) setTimeout(() => veRefs.current[i + 1]?.focus(), 0)
  }
  const handleVeKey = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !veCells[i] && i > 0) veRefs.current[i - 1]?.focus()
    if (e.key === 'Enter') handleVerifyEmail()
  }
  const handleVePaste = (e: React.ClipboardEvent) => {
    const s = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (s.length === 6) { setVeCells(s.split('')); setTimeout(() => veRefs.current[5]?.focus(), 0) }
    e.preventDefault()
  }

  const handleVerifyEmail = async () => {
    const code = veCells.join('')
    if (code.length < 6) { setVeError('Enter all 6 digits'); return }
    setVeError('')
    setVeLoading(true)
    try {
      await authService.verifyEmail(veEmail, code, 'admin')
      toast('success', 'Email verified!', 'You can now sign in to the Command Center.')
      setView('login')
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      if (e.code === 'OTP_EXPIRED') {
        setVeError('Code has expired. Please request a new one.')
      } else {
        setVeError(e.message ?? 'Invalid code. Please check and try again.')
      }
    } finally {
      setVeLoading(false)
    }
  }

  const handleVeResend = async () => {
    if (veTimer > 0 || veResending) return
    setVeResending(true)
    setVeError('')
    try {
      await authService.adminSignup({
        name: sgName.trim(),
        email: veEmail,
        password: sgPw,
        invite_code: sgInvite.trim(),
      })
      setVeCells(['', '', '', '', '', ''])
      startTimer(setVeTimer, veTimerRef)
      setTimeout(() => veRefs.current[0]?.focus(), 80)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setVeError(e.message ?? 'Could not resend. Please try again.')
    } finally {
      setVeResending(false)
    }
  }

  /* ── Forgot step 1 — send OTP ───────────────────────────── */
  const handleFpSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setFpEmailErr('')
    if (!validEmail(fpEmail)) { setFpEmailErr('Enter a valid email address'); return }
    setFpSending(true)
    try {
      await authService.requestAdminOtp(fpEmail.trim())
      setFpOtp(['', '', '', '', '', ''])
      setFpOtpErr('')
      setView('fp-otp')
      startTimer(setFpTimer, fpTimerRef)
      setTimeout(() => fpOtpRefs.current[0]?.focus(), 80)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setFpEmailErr(e.message ?? 'Could not send OTP. Please try again.')
    } finally {
      setFpSending(false)
    }
  }

  /* ── OTP cell interaction ────────────────────────────────── */
  const handleFpOtpChange = (i: number, v: string) => {
    const d = v.replace(/\D/g, '').slice(-1)
    setFpOtp(prev => { const n = [...prev]; n[i] = d; return n })
    if (d && i < 5) setTimeout(() => fpOtpRefs.current[i + 1]?.focus(), 0)
  }
  const handleFpOtpKey = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !fpOtp[i] && i > 0) fpOtpRefs.current[i - 1]?.focus()
    if (e.key === 'Enter') handleFpVerifyOtp()
  }
  const handleFpOtpPaste = (e: React.ClipboardEvent) => {
    const s = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (s.length === 6) { setFpOtp(s.split('')); setTimeout(() => fpOtpRefs.current[5]?.focus(), 0) }
    e.preventDefault()
  }

  /* ── Forgot step 2 — verify OTP ─────────────────────────── */
  const handleFpVerifyOtp = async () => {
    const code = fpOtp.join('')
    if (code.length < 6) { setFpOtpErr('Enter all 6 digits'); return }
    setFpOtpErr('')
    setFpVerifying(true)
    try {
      const res = await authService.verifyAdminOtp(fpEmail.trim(), code)
      setFpResetToken(res.reset_token)
      setFpNewPw(''); setFpConfPw('')
      setFpNewPwErr(''); setFpConfPwErr(''); setFpResetErr('')
      setView('fp-newpw')
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      if (e.code === 'OTP_EXPIRED') {
        setFpOtpErr('OTP has expired. Please request a new one.')
      } else if (e.code === 'OTP_RATE_LIMITED') {
        setFpOtpErr('Too many attempts. Please request a new OTP.')
      } else {
        setFpOtpErr(e.message ?? 'Invalid OTP. Please check and try again.')
      }
    } finally {
      setFpVerifying(false)
    }
  }

  /* ── Resend OTP ──────────────────────────────────────────── */
  const handleFpResendOtp = async () => {
    if (fpTimer > 0 || fpResending) return
    setFpResending(true)
    setFpOtpErr('')
    try {
      await authService.requestAdminOtp(fpEmail.trim())
      setFpOtp(['', '', '', '', '', ''])
      startTimer(setFpTimer, fpTimerRef)
      setTimeout(() => fpOtpRefs.current[0]?.focus(), 80)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setFpOtpErr(e.message ?? 'Could not resend. Please try again.')
    } finally {
      setFpResending(false)
    }
  }

  /* ── Forgot step 3 — reset password ─────────────────────── */
  const handleFpReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setFpResetErr('')
    let ok = true
    if (fpNewPw.length < 8) { setFpNewPwErr('Password must be at least 8 characters'); ok = false } else setFpNewPwErr('')
    if (fpConfPw !== fpNewPw) { setFpConfPwErr('Passwords do not match'); ok = false } else setFpConfPwErr('')
    if (!ok) return
    setFpResetting(true)
    try {
      await authService.adminResetPassword(fpResetToken, fpNewPw)
      toast('success', 'Password updated', 'You can now sign in with your new password.')
      setFpEmail(''); setFpOtp(['', '', '', '', '', '']); setFpResetToken('')
      setView('login')
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      if (e.code === 'RESET_TOKEN_EXPIRED') {
        setFpResetErr('Session expired. Please restart the password reset process.')
      } else {
        setFpResetErr(e.message ?? 'Unable to reset password. Please try again.')
      }
    } finally {
      setFpResetting(false)
    }
  }

  /* ── Back button ─────────────────────────────────────────── */
  const handleBack = () => {
    if (view === 'login')         navigate('/')
    else if (view === 'signup')   setView('login')
    else if (view === 'verify-email') setView('signup')
    else if (view === 'fp-email') setView('login')
    else if (view === 'fp-otp')   setView('fp-email')
    else                          setView('login')
  }
  const backLabel = view === 'login'       ? 'Back to home'
    : view === 'signup'       ? 'Back to sign in'
    : view === 'verify-email' ? 'Back to sign up'
    : view === 'fp-otp'       ? 'Back'
    : 'Back to sign in'

  const iClass = 'w-full py-2.5 rounded text-sm outline-none transition-all'

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8" style={{ background: 'transparent' }}>
      {/* Ambient crimson glow */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(198,40,50,0.06) 0%, transparent 70%)' }} />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38 }}
        className="w-full max-w-sm relative z-10"
      >
        {/* Back */}
        <button onClick={handleBack} className="btn-ghost text-xs mb-6 pl-0">
          <ArrowLeft size={13} />
          {backLabel}
        </button>

        <div className="panel p-8">
          <MediHawkLogo size="md" className="mb-6" />

          {DEMO_MODE && (
            <div className="mb-5 px-3 py-2 rounded text-xs text-center font-medium"
              style={{ background: 'rgba(198,40,50,0.07)', border: '1px solid rgba(198,40,50,0.20)', color: '#c62832' }}>
              Prototype Demo Mode — SIH 2026
            </div>
          )}

          <AnimatePresence mode="wait">

            {/* ══════════════════ MAIN LOGIN ══════════════════ */}
            {view === 'login' && (
              <motion.div key="login"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                {/* Admin identity header */}
                <div className="mb-5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Shield size={11} style={{ color: '#c62832' }} />
                    <span className="text-2xs font-semibold tracking-[0.16em] uppercase"
                      style={{ color: '#c62832' }}>
                      Admin Access
                    </span>
                  </div>
                  <h1 className="text-xl font-bold text-text-primary leading-tight">
                    MediHawk Command Center
                  </h1>
                  <p className="text-sm text-text-secondary mt-1">
                    Secure access for authorized operations personnel.
                  </p>
                </div>

                <form onSubmit={handleLogin} className="flex flex-col gap-4" noValidate>

                  {/* Email */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-text-secondary font-medium" htmlFor="admin-email">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                      <input
                        id="admin-email"
                        type="email"
                        value={email}
                        onChange={e => { setEmail(e.target.value); setEmailErr(''); setFormError('') }}
                        className={`${iClass} pl-9 pr-4`}
                        style={{ ...BASE_INPUT, ...(emailErr ? { borderColor: 'rgba(198,40,50,0.60)' } : {}) }}
                        placeholder="admin@medihawk.in"
                        autoComplete="email"
                        onFocus={e => applyFocus(e.target as HTMLInputElement)}
                        onBlur={e  => applyBlur(e.target as HTMLInputElement)}
                      />
                    </div>
                    {emailErr && <p className="text-xs" style={{ color: '#c62832' }}>{emailErr}</p>}
                  </div>

                  {/* Password */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-text-secondary font-medium" htmlFor="admin-password">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => { setView('fp-email'); setFpEmail(email); setFpEmailErr('') }}
                        className="text-xs transition-opacity hover:opacity-75"
                        style={{ color: '#c62832' }}
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                      <input
                        id="admin-password"
                        type={showPw ? 'text' : 'password'}
                        value={password}
                        onChange={e => { setPassword(e.target.value); setPwErr(''); setFormError('') }}
                        className={`${iClass} pl-9 pr-10`}
                        style={{ ...BASE_INPUT, ...(pwErr ? { borderColor: 'rgba(198,40,50,0.60)' } : {}) }}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        onFocus={e => applyFocus(e.target as HTMLInputElement)}
                        onBlur={e  => applyBlur(e.target as HTMLInputElement)}
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-label={showPw ? 'Hide password' : 'Show password'}
                        onClick={() => setShowPw(!showPw)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                      >
                        {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    {pwErr && <p className="text-xs" style={{ color: '#c62832' }}>{pwErr}</p>}
                  </div>

                  {/* Remember me */}
                  <label className="flex items-center gap-2 cursor-pointer select-none -mt-1">
                    <button
                      type="button"
                      onClick={() => setRememberMe(!rememberMe)}
                      aria-checked={rememberMe}
                      role="checkbox"
                      className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all"
                      style={{
                        border: rememberMe ? '1.5px solid #c62832' : '1.5px solid rgba(23,35,43,0.25)',
                        background: rememberMe ? '#c62832' : 'rgba(243,247,249,0.92)',
                      }}
                    >
                      {rememberMe && (
                        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                          <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.6"
                            strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                    <span className="text-xs text-text-secondary">Remember me</span>
                  </label>

                  {/* Form error */}
                  {formError && (
                    <p className="text-xs rounded px-3 py-2"
                      style={{ color: '#c62832', background: 'rgba(198,40,50,0.06)', border: '1px solid rgba(198,40,50,0.14)' }}>
                      {formError}
                    </p>
                  )}

                  {/* Submit */}
                  <button type="submit" disabled={loading} className="btn-primary w-full mt-0.5">
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Spinner /> Connecting to Command Center…
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-1.5">
                        Enter Command Center <ChevronRight size={14} />
                      </span>
                    )}
                  </button>
                </form>

                {DEMO_MODE && (
                  <>
                    <div className="flex items-center gap-3 my-4">
                      <div className="flex-1 h-px" style={{ background: 'rgba(23,35,43,0.10)' }} />
                      <span className="text-2xs text-text-muted uppercase tracking-wider">or</span>
                      <div className="flex-1 h-px" style={{ background: 'rgba(23,35,43,0.10)' }} />
                    </div>
                    <button type="button" onClick={handleDemoLogin} disabled={loading}
                      className="w-full text-sm mb-3 py-2.5 rounded font-medium transition-all flex items-center justify-center gap-1.5"
                      style={{ background: 'rgba(198,40,50,0.10)', border: '1px solid rgba(198,40,50,0.25)', color: '#c62832' }}>
                      <Zap size={14} />
                      Demo Access — Command Center
                    </button>
                  </>
                )}

                {/* Sign up + Doctor link */}
                <div className="mt-5 flex flex-col gap-2 text-center">
                  <button
                    type="button"
                    onClick={() => { setView('signup'); setSgError('') }}
                    className="text-xs text-text-muted hover:text-text-secondary transition-colors"
                  >
                    New administrator?{' '}
                    <span style={{ color: '#c62832' }}>Request access →</span>
                  </button>
                  <button
                    onClick={() => navigate('/auth/doctor')}
                    className="text-xs text-text-muted hover:text-text-secondary transition-colors"
                  >
                    Need Doctor Access?{' '}
                    <span style={{ color: '#c62832' }}>Doctor Portal →</span>
                  </button>
                </div>
              </motion.div>
            )}

            {/* ══════════════════ SIGNUP VIEW ══════════════════ */}
            {view === 'signup' && (
              <motion.div key="signup"
                initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }}
                transition={{ duration: 0.20 }}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Shield size={11} style={{ color: '#c62832' }} />
                  <span className="text-2xs font-semibold tracking-[0.16em] uppercase" style={{ color: '#c62832' }}>
                    Admin Access
                  </span>
                </div>
                <h2 className="text-xl font-bold text-text-primary mb-1">Request Access</h2>
                <p className="text-sm text-text-secondary mb-5">
                  Admin accounts require an invite code from your system administrator.
                </p>

                <form onSubmit={handleSignup} className="flex flex-col gap-3.5" noValidate>

                  {/* Name */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-text-secondary font-medium" htmlFor="sg-name">Full Name</label>
                    <input
                      id="sg-name"
                      type="text"
                      value={sgName}
                      onChange={e => { setSgName(e.target.value); setSgNameErr('') }}
                      className={`${iClass} px-3`}
                      style={{ ...BASE_INPUT, ...(sgNameErr ? { borderColor: 'rgba(198,40,50,0.60)' } : {}) }}
                      placeholder="Full Name"
                      autoComplete="name"
                      autoFocus
                      onFocus={e => applyFocus(e.target as HTMLInputElement)}
                      onBlur={e  => applyBlur(e.target as HTMLInputElement)}
                    />
                    {sgNameErr && <p className="text-xs" style={{ color: '#c62832' }}>{sgNameErr}</p>}
                  </div>

                  {/* Email */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-text-secondary font-medium" htmlFor="sg-email">Email Address</label>
                    <div className="relative">
                      <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                      <input
                        id="sg-email"
                        type="email"
                        value={sgEmail}
                        onChange={e => { setSgEmail(e.target.value); setSgEmailErr('') }}
                        className={`${iClass} pl-9 pr-4`}
                        style={{ ...BASE_INPUT, ...(sgEmailErr ? { borderColor: 'rgba(198,40,50,0.60)' } : {}) }}
                        placeholder="admin@medihawk.in"
                        autoComplete="email"
                        onFocus={e => applyFocus(e.target as HTMLInputElement)}
                        onBlur={e  => applyBlur(e.target as HTMLInputElement)}
                      />
                    </div>
                    {sgEmailErr && <p className="text-xs" style={{ color: '#c62832' }}>{sgEmailErr}</p>}
                  </div>

                  {/* Password */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-text-secondary font-medium" htmlFor="sg-pw">Password</label>
                    <div className="relative">
                      <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                      <input
                        id="sg-pw"
                        type={sgShowPw ? 'text' : 'password'}
                        value={sgPw}
                        onChange={e => { setSgPw(e.target.value); setSgPwErr('') }}
                        className={`${iClass} pl-9 pr-10`}
                        style={{ ...BASE_INPUT, ...(sgPwErr ? { borderColor: 'rgba(198,40,50,0.60)' } : {}) }}
                        placeholder="Minimum 8 characters"
                        autoComplete="new-password"
                        onFocus={e => applyFocus(e.target as HTMLInputElement)}
                        onBlur={e  => applyBlur(e.target as HTMLInputElement)}
                      />
                      <button type="button" tabIndex={-1}
                        onClick={() => setSgShowPw(!sgShowPw)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors">
                        {sgShowPw ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    {sgPwErr && <p className="text-xs" style={{ color: '#c62832' }}>{sgPwErr}</p>}
                  </div>

                  {/* Confirm password */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-text-secondary font-medium" htmlFor="sg-conf-pw">Confirm Password</label>
                    <div className="relative">
                      <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                      <input
                        id="sg-conf-pw"
                        type="password"
                        value={sgConfPw}
                        onChange={e => { setSgConfPw(e.target.value); setSgConfPwErr('') }}
                        className={`${iClass} pl-9 pr-4`}
                        style={{ ...BASE_INPUT, ...(sgConfPwErr ? { borderColor: 'rgba(198,40,50,0.60)' } : {}) }}
                        placeholder="Re-enter your password"
                        autoComplete="new-password"
                        onFocus={e => applyFocus(e.target as HTMLInputElement)}
                        onBlur={e  => applyBlur(e.target as HTMLInputElement)}
                      />
                    </div>
                    {sgConfPwErr && <p className="text-xs" style={{ color: '#c62832' }}>{sgConfPwErr}</p>}
                  </div>

                  {/* Invite code */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-text-secondary font-medium" htmlFor="sg-invite">Invite Code</label>
                    <div className="relative">
                      <Key size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                      <input
                        id="sg-invite"
                        type="text"
                        value={sgInvite}
                        onChange={e => { setSgInvite(e.target.value); setSgInviteErr('') }}
                        className={`${iClass} pl-9 pr-4`}
                        style={{ ...BASE_INPUT, ...(sgInviteErr ? { borderColor: 'rgba(198,40,50,0.60)' } : {}) }}
                        placeholder="From your system administrator"
                        autoComplete="off"
                        onFocus={e => applyFocus(e.target as HTMLInputElement)}
                        onBlur={e  => applyBlur(e.target as HTMLInputElement)}
                      />
                    </div>
                    {sgInviteErr && <p className="text-xs" style={{ color: '#c62832' }}>{sgInviteErr}</p>}
                  </div>

                  {sgError && (
                    <p className="text-xs rounded px-3 py-2"
                      style={{ color: '#c62832', background: 'rgba(198,40,50,0.06)', border: '1px solid rgba(198,40,50,0.14)' }}>
                      {sgError}
                    </p>
                  )}

                  <button type="submit" disabled={sgLoading} className="btn-primary w-full mt-0.5">
                    {sgLoading
                      ? <span className="flex items-center justify-center gap-2"><Spinner /> Creating Account…</span>
                      : <span className="flex items-center justify-center gap-1.5"><UserPlus size={14} /> Create Admin Account</span>}
                  </button>
                </form>
              </motion.div>
            )}

            {/* ══════════════════ VERIFY EMAIL VIEW ══════════════════ */}
            {view === 'verify-email' && (
              <motion.div key="verify-email"
                initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }}
                transition={{ duration: 0.20 }}
              >
                <h2 className="text-xl font-bold text-text-primary mb-1">Verify your email</h2>
                <p className="text-sm text-text-secondary mb-6">
                  Enter the 6-digit code sent to{' '}
                  <span className="font-medium text-text-primary">{veEmail}</span>.
                </p>

                <OtpGrid cells={veCells} refs={veRefs}
                  onChange={handleVeChange} onKey={handleVeKey} onPaste={handleVePaste}
                  error={veError} />

                <button
                  type="button"
                  onClick={handleVerifyEmail}
                  disabled={veLoading || veCells.join('').length < 6}
                  className="btn-primary w-full mt-4"
                >
                  {veLoading
                    ? <span className="flex items-center justify-center gap-2"><Spinner /> Verifying…</span>
                    : 'Verify Email'}
                </button>

                <div className="flex items-center justify-between mt-4">
                  <button type="button" onClick={handleVeResend}
                    disabled={veTimer > 0 || veResending}
                    className="text-xs transition-colors"
                    style={{ color: veTimer > 0 ? 'rgba(23,35,43,0.35)' : '#c62832', cursor: veTimer > 0 ? 'default' : 'pointer' }}>
                    {veResending ? 'Sending…' : veTimer > 0 ? `Resend in ${veTimer}s` : 'Resend Code'}
                  </button>
                </div>
              </motion.div>
            )}

            {/* ══════════════════ FORGOT — STEP 1: EMAIL ══════════════════ */}
            {view === 'fp-email' && (
              <motion.div key="fp-email"
                initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }}
                transition={{ duration: 0.20 }}
              >
                <h2 className="text-xl font-bold text-text-primary mb-1">Reset your password</h2>

                {DEMO_MODE ? (
                  <div className="mb-5">
                    <p className="text-sm px-3 py-3 rounded"
                      style={{ color: '#c62832', background: 'rgba(198,40,50,0.07)', border: '1px solid rgba(198,40,50,0.20)' }}>
                      Demo mode: password recovery is unavailable in prototype mode. Use Demo Access.
                    </p>
                    <button type="button" onClick={() => setView('login')}
                      className="mt-3 text-xs text-text-muted hover:text-text-secondary transition-colors">
                      ← Back to sign in
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-text-secondary mb-5">
                      Enter your registered administrator email address.
                    </p>
                <form onSubmit={handleFpSendOtp} className="flex flex-col gap-4" noValidate>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-text-secondary font-medium" htmlFor="fp-email-input">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                      <input
                        id="fp-email-input"
                        type="email"
                        value={fpEmail}
                        onChange={e => { setFpEmail(e.target.value); setFpEmailErr('') }}
                        className={`${iClass} pl-9 pr-4`}
                        style={{ ...BASE_INPUT, ...(fpEmailErr ? { borderColor: 'rgba(198,40,50,0.60)' } : {}) }}
                        placeholder="admin@medihawk.in"
                        autoComplete="email"
                        autoFocus
                        onFocus={e => applyFocus(e.target as HTMLInputElement)}
                        onBlur={e  => applyBlur(e.target as HTMLInputElement)}
                      />
                    </div>
                    {fpEmailErr && <p className="text-xs" style={{ color: '#c62832' }}>{fpEmailErr}</p>}
                  </div>

                  <button type="submit" disabled={fpSending || !fpEmail.trim()} className="btn-primary w-full">
                    {fpSending
                      ? <span className="flex items-center justify-center gap-2"><Spinner /> Sending OTP…</span>
                      : 'Send OTP'}
                  </button>
                </form>
                  </>
                )}
              </motion.div>
            )}

            {/* ══════════════════ FORGOT — STEP 2: OTP ══════════════════ */}
            {view === 'fp-otp' && (
              <motion.div key="fp-otp"
                initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }}
                transition={{ duration: 0.20 }}
              >
                <h2 className="text-xl font-bold text-text-primary mb-1">Verify your identity</h2>
                <p className="text-sm text-text-secondary mb-5">
                  Enter the 6-digit code sent to{' '}
                  <span className="font-medium text-text-primary">{fpEmail}</span>.
                </p>

                <OtpGrid cells={fpOtp} refs={fpOtpRefs}
                  onChange={handleFpOtpChange} onKey={handleFpOtpKey} onPaste={handleFpOtpPaste}
                  error={fpOtpErr} />

                <button
                  type="button"
                  onClick={handleFpVerifyOtp}
                  disabled={fpVerifying || fpOtp.join('').length < 6}
                  className="btn-primary w-full mt-4"
                >
                  {fpVerifying
                    ? <span className="flex items-center justify-center gap-2"><Spinner /> Verifying…</span>
                    : 'Verify OTP'}
                </button>

                <div className="flex items-center justify-between mt-4">
                  <button
                    type="button"
                    onClick={handleFpResendOtp}
                    disabled={fpTimer > 0 || fpResending}
                    className="text-xs transition-colors"
                    style={{
                      color: fpTimer > 0 ? 'rgba(23,35,43,0.35)' : '#c62832',
                      cursor: fpTimer > 0 ? 'default' : 'pointer',
                    }}
                  >
                    {fpResending ? 'Sending…' : fpTimer > 0 ? `Resend in ${fpTimer}s` : 'Resend OTP'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setView('fp-email'); setFpOtp(['', '', '', '', '', '']) }}
                    className="text-xs text-text-muted hover:text-text-secondary transition-colors"
                  >
                    Change email
                  </button>
                </div>
              </motion.div>
            )}

            {/* ══════════════════ FORGOT — STEP 3: NEW PASSWORD ══════════════════ */}
            {view === 'fp-newpw' && (
              <motion.div key="fp-newpw"
                initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }}
                transition={{ duration: 0.20 }}
              >
                <h2 className="text-xl font-bold text-text-primary mb-1">Create new password</h2>
                <p className="text-sm text-text-secondary mb-5">
                  Choose a strong password for your administrator account.
                </p>

                <form onSubmit={handleFpReset} className="flex flex-col gap-4" noValidate>

                  {/* New password */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-text-secondary font-medium" htmlFor="fp-new-pw">
                      New Password
                    </label>
                    <div className="relative">
                      <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                      <input
                        id="fp-new-pw"
                        type={fpShowNew ? 'text' : 'password'}
                        value={fpNewPw}
                        onChange={e => { setFpNewPw(e.target.value); setFpNewPwErr('') }}
                        className={`${iClass} pl-9 pr-10`}
                        style={{ ...BASE_INPUT, ...(fpNewPwErr ? { borderColor: 'rgba(198,40,50,0.60)' } : {}) }}
                        placeholder="Minimum 8 characters"
                        autoComplete="new-password"
                        autoFocus
                        onFocus={e => applyFocus(e.target as HTMLInputElement)}
                        onBlur={e  => applyBlur(e.target as HTMLInputElement)}
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-label={fpShowNew ? 'Hide password' : 'Show password'}
                        onClick={() => setFpShowNew(!fpShowNew)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                      >
                        {fpShowNew ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    {fpNewPwErr && <p className="text-xs" style={{ color: '#c62832' }}>{fpNewPwErr}</p>}
                  </div>

                  {/* Confirm password */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-text-secondary font-medium" htmlFor="fp-conf-pw">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                      <input
                        id="fp-conf-pw"
                        type={fpShowConf ? 'text' : 'password'}
                        value={fpConfPw}
                        onChange={e => { setFpConfPw(e.target.value); setFpConfPwErr('') }}
                        className={`${iClass} pl-9 pr-10`}
                        style={{ ...BASE_INPUT, ...(fpConfPwErr ? { borderColor: 'rgba(198,40,50,0.60)' } : {}) }}
                        placeholder="Re-enter your new password"
                        autoComplete="new-password"
                        onFocus={e => applyFocus(e.target as HTMLInputElement)}
                        onBlur={e  => applyBlur(e.target as HTMLInputElement)}
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-label={fpShowConf ? 'Hide password' : 'Show password'}
                        onClick={() => setFpShowConf(!fpShowConf)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                      >
                        {fpShowConf ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    {fpConfPwErr && <p className="text-xs" style={{ color: '#c62832' }}>{fpConfPwErr}</p>}
                  </div>

                  {fpResetErr && (
                    <p className="text-xs rounded px-3 py-2"
                      style={{ color: '#c62832', background: 'rgba(198,40,50,0.06)', border: '1px solid rgba(198,40,50,0.14)' }}>
                      {fpResetErr}
                    </p>
                  )}

                  <button type="submit" disabled={fpResetting} className="btn-primary w-full">
                    {fpResetting
                      ? <span className="flex items-center justify-center gap-2"><Spinner /> Resetting…</span>
                      : 'Reset Password'}
                  </button>
                </form>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}
