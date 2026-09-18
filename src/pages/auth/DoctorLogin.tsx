import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Phone, Mail, Lock, Eye, EyeOff, ArrowLeft,
  MessageSquare, ChevronRight, UserPlus,
} from 'lucide-react'
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
function validPhone(v: string) { return /^\d{10}$/.test(v.replace(/[\s\-]/g, '')) }
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

/* ── Phone input with +91 prefix ──────────────────────────────── */
function PhoneInput({ value, onChange, hasError }: {
  value: string; onChange: (v: string) => void; hasError: boolean
}) {
  const [focused, setFocused] = useState(false)
  const borderColor = focused
    ? 'rgba(198,40,50,0.38)'
    : hasError ? 'rgba(198,40,50,0.60)' : 'rgba(23,35,43,0.12)'
  const shadow = focused ? '0 0 0 3px rgba(198,40,50,0.08)' : undefined

  return (
    <div className="flex rounded overflow-hidden transition-all"
      style={{ border: `1px solid ${borderColor}`, boxShadow: shadow, background: 'rgba(243,247,249,0.92)' }}>
      <div className="flex items-center gap-1 px-3 flex-shrink-0 select-none"
        style={{ borderRight: '1px solid rgba(23,35,43,0.10)', color: '#17232B' }}>
        <Phone size={12} style={{ color: 'rgba(23,35,43,0.38)' }} />
        <span className="text-sm font-medium">+91</span>
      </div>
      <input
        id="phone"
        type="tel"
        inputMode="numeric"
        value={value}
        onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 10))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="flex-1 py-2.5 px-3 text-sm outline-none"
        style={{ background: 'transparent', color: '#17232B' }}
        placeholder="Enter your phone number"
        autoComplete="tel-national"
      />
    </div>
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
type View = 'login' | 'otp' | 'signup' | 'verify-email' | 'fp-request' | 'fp-otp' | 'fp-newpw'

export function DoctorLogin() {
  const navigate        = useNavigate()
  const { loginUser }   = useStore()
  const { toast }       = useToast()

  const [view, setView] = useState<View>('login')

  // Login form
  const [authMethod, setAuthMethod] = useState<'phone' | 'email'>('phone')
  const [phone, setPhone]           = useState('')
  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [showPw, setShowPw]         = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading]       = useState(false)
  const [formError, setFormError]   = useState('')
  const [phoneErr, setPhoneErr]     = useState('')
  const [emailErr, setEmailErr]     = useState('')
  const [pwErr, setPwErr]           = useState('')

  // OTP (login)
  const [otpCells, setOtpCells]   = useState(['', '', '', '', '', ''])
  const [otpTimer, setOtpTimer]   = useState(0)
  const [otpLoading, setOtpLoading] = useState(false)
  const [otpSending, setOtpSending] = useState(false)
  const [otpError, setOtpError]   = useState('')
  const otpRefs = useRef<Array<HTMLInputElement | null>>(Array(6).fill(null))
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Signup
  const [sgName, setSgName]     = useState('')
  const [sgEmail, setSgEmail]   = useState('')
  const [sgPhone, setSgPhone]   = useState('')
  const [sgPw, setSgPw]         = useState('')
  const [sgConfPw, setSgConfPw] = useState('')
  const [sgMedReg, setSgMedReg] = useState('')
  const [sgPhcId, setSgPhcId]   = useState('')
  const [sgInvCode, setSgInvCode] = useState('')
  const [sgShowPw, setSgShowPw] = useState(false)
  const [sgLoading, setSgLoading] = useState(false)
  const [sgError, setSgError]   = useState('')
  const [sgNameErr, setSgNameErr]   = useState('')
  const [sgEmailErr, setSgEmailErr] = useState('')
  const [sgPhoneErr, setSgPhoneErr] = useState('')
  const [sgPwErr, setSgPwErr]       = useState('')
  const [sgConfPwErr, setSgConfPwErr] = useState('')
  const [sgMedRegErr, setSgMedRegErr] = useState('')
  const [sgPhcIdErr, setSgPhcIdErr]   = useState('')
  const [sgInvCodeErr, setSgInvCodeErr] = useState('')

  // Email verification (after signup)
  const [veEmail, setVeEmail]   = useState('')
  const [veCells, setVeCells]   = useState(['', '', '', '', '', ''])
  const [veLoading, setVeLoading] = useState(false)
  const [veResending, setVeResending] = useState(false)
  const [veTimer, setVeTimer]   = useState(0)
  const [veError, setVeError]   = useState('')
  const veRefs = useRef<Array<HTMLInputElement | null>>(Array(6).fill(null))
  const veTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Forgot password — step 1: contact
  const [fpContact, setFpContact] = useState('')
  const [fpSending, setFpSending] = useState(false)
  const [fpContactErr, setFpContactErr] = useState('')

  // Forgot password — step 2: OTP
  const [fpOtpCells, setFpOtpCells] = useState(['', '', '', '', '', ''])
  const [fpOtpLoading, setFpOtpLoading] = useState(false)
  const [fpOtpResending, setFpOtpResending] = useState(false)
  const [fpOtpTimer, setFpOtpTimer] = useState(0)
  const [fpOtpError, setFpOtpError] = useState('')
  const fpOtpRefs = useRef<Array<HTMLInputElement | null>>(Array(6).fill(null))
  const fpOtpTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Forgot password — step 3: new password
  const [fpResetToken, setFpResetToken] = useState('')
  const [fpNewPw, setFpNewPw]     = useState('')
  const [fpConfPw, setFpConfPw]   = useState('')
  const [fpShowNew, setFpShowNew] = useState(false)
  const [fpShowConf, setFpShowConf] = useState(false)
  const [fpNewPwErr, setFpNewPwErr]   = useState('')
  const [fpConfPwErr, setFpConfPwErr] = useState('')
  const [fpResetting, setFpResetting] = useState(false)
  const [fpResetErr, setFpResetErr]   = useState('')

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (veTimerRef.current) clearInterval(veTimerRef.current)
    if (fpOtpTimerRef.current) clearInterval(fpOtpTimerRef.current)
  }, [])

  const startTimer = (setter: React.Dispatch<React.SetStateAction<number>>, ref: React.MutableRefObject<ReturnType<typeof setInterval> | null>) => {
    if (ref.current) clearInterval(ref.current)
    setter(60)
    ref.current = setInterval(() => {
      setter(t => { if (t <= 1) { clearInterval(ref.current!); return 0 } return t - 1 })
    }, 1000)
  }

  const validateContact = (): boolean => {
    if (authMethod === 'phone') {
      if (!validPhone(phone)) { setPhoneErr('Enter a valid 10-digit phone number'); return false }
      setPhoneErr('')
    } else {
      if (!validEmail(email)) { setEmailErr('Enter a valid email address'); return false }
      setEmailErr('')
    }
    return true
  }

  /* ── Login ─────────────────────────────────────────────── */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    let ok = validateContact()
    if (!password) { setPwErr('Password is required'); ok = false } else setPwErr('')
    if (!ok) return
    setLoading(true)
    try {
      const payload = authMethod === 'phone'
        ? { phone: phone.replace(/[\s\-]/g, ''), password, role: 'doctor' }
        : { email, password, role: 'doctor' }
      const res = await authService.login(payload)
      saveToken(res.token)
      loginUser({
        id: res.user.id,
        name: res.user.name,
        email: res.user.email,
        role: 'doctor',
        phone: res.user.phone,
        phc: res.user.phc,
      })
      toast('success', `Welcome, ${res.user.name}`, 'Authentication successful')
      navigate('/doctor')
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code === 'INVALID_CREDENTIALS') {
        setFormError('Invalid credentials. Check your phone/email and password.')
      } else if (code === 'DOCTOR_VERIFICATION_PENDING') {
        setFormError('Your account is pending administrator review. You will be notified once approved.')
      } else if (code === 'DOCTOR_VERIFICATION_REJECTED') {
        setFormError('Your registration was not approved. Please contact support for more information.')
      } else if (code === 'DOCTOR_ACCOUNT_SUSPENDED') {
        setFormError('Your account has been suspended. Please contact the administrator.')
      } else {
        setFormError('Unable to sign in. Check your credentials and try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  /* ── Send OTP (login) ──────────────────────────────────── */
  const handleSendOtp = async () => {
    setFormError('')
    if (!validateContact()) return
    if (authMethod !== 'email') {
      setFormError('OTP login requires an email address. Please switch to email.')
      return
    }
    setOtpSending(true)
    try {
      await authService.requestOtp(email.trim(), 'doctor')
      setOtpCells(['', '', '', '', '', ''])
      setOtpError('')
      setView('otp')
      startTimer(setOtpTimer, timerRef)
      setTimeout(() => otpRefs.current[0]?.focus(), 80)
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      setFormError(e.message ?? 'Could not send OTP. Please try again.')
    } finally {
      setOtpSending(false)
    }
  }

  /* ── OTP cell interaction (login) ─────────────────────── */
  const handleOtpChange = (i: number, v: string) => {
    const d = v.replace(/\D/g, '').slice(-1)
    setOtpCells(prev => { const n = [...prev]; n[i] = d; return n })
    if (d && i < 5) setTimeout(() => otpRefs.current[i + 1]?.focus(), 0)
  }
  const handleOtpKey = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpCells[i] && i > 0) otpRefs.current[i - 1]?.focus()
    if (e.key === 'Enter') handleVerifyOtp()
  }
  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const s = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (s.length === 6) { setOtpCells(s.split('')); setTimeout(() => otpRefs.current[5]?.focus(), 0) }
    e.preventDefault()
  }

  /* ── Verify OTP (login) ────────────────────────────────── */
  const handleVerifyOtp = async () => {
    const code = otpCells.join('')
    if (code.length < 6) { setOtpError('Enter all 6 digits'); return }
    setOtpError('')
    setOtpLoading(true)
    try {
      const res = await authService.verifyOtp(email.trim(), code, 'doctor')
      saveToken(res.token)
      loginUser({
        id: res.user.id,
        name: res.user.name,
        email: res.user.email,
        role: 'doctor',
        phc: res.user.phc,
      })
      toast('success', `Welcome, ${res.user.name}`, 'Authentication successful')
      navigate('/doctor')
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      if (e.code === 'OTP_EXPIRED') {
        setOtpError('OTP has expired. Please request a new one.')
      } else if (e.code === 'OTP_RATE_LIMITED') {
        setOtpError('Too many attempts. Please request a new OTP.')
      } else {
        setOtpError(e.message ?? 'Invalid OTP. Please check and try again.')
      }
    } finally {
      setOtpLoading(false)
    }
  }

  /* ── Resend OTP (login) ────────────────────────────────── */
  const handleResendOtp = async () => {
    if (otpTimer > 0 || otpSending) return
    setOtpSending(true)
    setOtpError('')
    try {
      await authService.requestOtp(email.trim(), 'doctor')
      setOtpCells(['', '', '', '', '', ''])
      startTimer(setOtpTimer, timerRef)
      setTimeout(() => otpRefs.current[0]?.focus(), 80)
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      setOtpError(e.message ?? 'Could not resend. Please try again.')
    } finally {
      setOtpSending(false)
    }
  }

  /* ── Signup ────────────────────────────────────────────── */
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setSgError('')
    let valid = true
    if (!sgName.trim()) { setSgNameErr('Full name is required'); valid = false } else setSgNameErr('')
    if (!validEmail(sgEmail)) { setSgEmailErr('Enter a valid email address'); valid = false } else setSgEmailErr('')
    if (!validPhone(sgPhone)) { setSgPhoneErr('Enter a valid 10-digit phone number'); valid = false } else setSgPhoneErr('')
    if (sgPw.length < 8) { setSgPwErr('Password must be at least 8 characters'); valid = false } else setSgPwErr('')
    if (sgConfPw !== sgPw) { setSgConfPwErr('Passwords do not match'); valid = false } else setSgConfPwErr('')
    if (!sgMedReg.trim()) { setSgMedRegErr('Medical registration number is required'); valid = false } else setSgMedRegErr('')
    if (!sgPhcId.trim()) { setSgPhcIdErr('Please select your PHC/CHC facility'); valid = false } else setSgPhcIdErr('')
    if (!sgInvCode.trim()) { setSgInvCodeErr('Invitation code is required'); valid = false } else setSgInvCodeErr('')
    if (!valid) return
    setSgLoading(true)
    try {
      await authService.doctorSignup({
        name: sgName.trim(),
        email: sgEmail.trim().toLowerCase(),
        phone: sgPhone.replace(/[\s\-]/g, ''),
        password: sgPw,
        medical_registration_no: sgMedReg.trim(),
        phc_id: sgPhcId.trim(),
        invitation_code: sgInvCode.trim(),
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
      } else if (e.code === 'PHONE_EXISTS') {
        setSgPhoneErr('An account with this phone number already exists.')
      } else if (e.code === 'MED_REG_NO_EXISTS') {
        setSgMedRegErr('An account with this registration number already exists.')
      } else if (e.code === 'INVALID_INVITATION_CODE') {
        setSgInvCodeErr('Invalid, expired, or already-used invitation code.')
      } else {
        setSgError(e.message ?? 'Could not create account. Please try again.')
      }
    } finally {
      setSgLoading(false)
    }
  }

  /* ── Email verification OTP ────────────────────────────── */
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
      await authService.verifyEmail(veEmail, code, 'doctor')
      toast('success', 'Email verified!', 'You can now sign in to your account.')
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
      await authService.doctorSignup({
        name: sgName.trim(),
        email: veEmail,
        phone: sgPhone.replace(/[\s\-]/g, ''),
        password: sgPw,
        medical_registration_no: sgMedReg.trim(),
        phc_id: sgPhcId.trim(),
        invitation_code: sgInvCode.trim(),
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

  /* ── Forgot password — step 1: request OTP ─────────────── */
  const handleFpRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setFpContactErr('')
    if (!fpContact.trim()) { setFpContactErr('Enter your phone number or email'); return }
    setFpSending(true)
    try {
      await authService.forgotPasswordRequest(fpContact.trim())
      setFpOtpCells(['', '', '', '', '', ''])
      setFpOtpError('')
      startTimer(setFpOtpTimer, fpOtpTimerRef)
      setView('fp-otp')
      setTimeout(() => fpOtpRefs.current[0]?.focus(), 80)
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      if (e.code === 'OTP_RATE_LIMITED') {
        setFpContactErr(e.message ?? 'Too many requests. Please wait before trying again.')
      } else {
        setFpContactErr(e.message ?? 'Could not send reset code. Please try again.')
      }
    } finally {
      setFpSending(false)
    }
  }

  /* ── Forgot password — step 2: verify OTP ──────────────── */
  const handleFpOtpChange = (i: number, v: string) => {
    const d = v.replace(/\D/g, '').slice(-1)
    setFpOtpCells(prev => { const n = [...prev]; n[i] = d; return n })
    if (d && i < 5) setTimeout(() => fpOtpRefs.current[i + 1]?.focus(), 0)
  }
  const handleFpOtpKey = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !fpOtpCells[i] && i > 0) fpOtpRefs.current[i - 1]?.focus()
    if (e.key === 'Enter') handleFpVerifyOtp()
  }
  const handleFpOtpPaste = (e: React.ClipboardEvent) => {
    const s = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (s.length === 6) { setFpOtpCells(s.split('')); setTimeout(() => fpOtpRefs.current[5]?.focus(), 0) }
    e.preventDefault()
  }

  const handleFpVerifyOtp = async () => {
    const code = fpOtpCells.join('')
    if (code.length < 6) { setFpOtpError('Enter all 6 digits'); return }
    setFpOtpError('')
    setFpOtpLoading(true)
    try {
      const res = await authService.forgotPasswordVerify(fpContact.trim(), code)
      setFpResetToken(res.reset_token)
      setFpNewPw(''); setFpConfPw('')
      setFpNewPwErr(''); setFpConfPwErr(''); setFpResetErr('')
      setView('fp-newpw')
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      if (e.code === 'OTP_EXPIRED') {
        setFpOtpError('Code has expired. Please request a new one.')
      } else if (e.code === 'OTP_RATE_LIMITED') {
        setFpOtpError('Too many attempts. Please request a new code.')
      } else {
        setFpOtpError(e.message ?? 'Invalid code. Please check and try again.')
      }
    } finally {
      setFpOtpLoading(false)
    }
  }

  const handleFpOtpResend = async () => {
    if (fpOtpTimer > 0 || fpOtpResending) return
    setFpOtpResending(true)
    setFpOtpError('')
    try {
      await authService.forgotPasswordRequest(fpContact.trim())
      setFpOtpCells(['', '', '', '', '', ''])
      startTimer(setFpOtpTimer, fpOtpTimerRef)
      setTimeout(() => fpOtpRefs.current[0]?.focus(), 80)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setFpOtpError(e.message ?? 'Could not resend. Please try again.')
    } finally {
      setFpOtpResending(false)
    }
  }

  /* ── Forgot password — step 3: new password ─────────────── */
  const handleFpReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setFpResetErr('')
    let valid = true
    if (fpNewPw.length < 8) { setFpNewPwErr('Password must be at least 8 characters'); valid = false } else setFpNewPwErr('')
    if (fpConfPw !== fpNewPw) { setFpConfPwErr('Passwords do not match'); valid = false } else setFpConfPwErr('')
    if (!valid) return
    setFpResetting(true)
    try {
      await authService.resetPassword(fpResetToken, fpNewPw)
      toast('success', 'Password updated', 'You can now sign in with your new password.')
      setFpContact(''); setFpOtpCells(['', '', '', '', '', '']); setFpResetToken('')
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

  /* ── Input shared class ────────────────────────────────── */
  const iClass = 'w-full py-2.5 rounded text-sm outline-none transition-all'

  /* ── Back button logic ─────────────────────────────────── */
  const handleBack = () => {
    if (view === 'login')       navigate('/')
    else if (view === 'otp')    { setView('login'); setOtpCells(['', '', '', '', '', '']) }
    else if (view === 'signup') setView('login')
    else if (view === 'verify-email') setView('signup')
    else if (view === 'fp-request') setView('login')
    else if (view === 'fp-otp') setView('fp-request')
    else                        setView('login')
  }

  const backLabel = view === 'login' ? 'Back to home'
    : view === 'signup'       ? 'Back to sign in'
    : view === 'verify-email' ? 'Back to sign up'
    : view === 'fp-otp'       ? 'Back'
    : view === 'fp-newpw'     ? 'Back'
    : 'Back to sign in'

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'transparent' }}>
      {/* ambient glow */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(31,157,104,0.05) 0%, transparent 70%)' }} />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm relative z-10"
      >
        {/* Back */}
        <button onClick={handleBack} className="btn-ghost text-xs mb-6 pl-0">
          <ArrowLeft size={13} />
          {backLabel}
        </button>

        <div className="panel p-8">
          <MediHawkLogo size="md" className="mb-6" />

          <AnimatePresence mode="wait">

            {/* ══════════════════ OTP VIEW (login) ══════════════════ */}
            {view === 'otp' && (
              <motion.div key="otp"
                initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }}
                transition={{ duration: 0.20 }}
              >
                <h2 className="text-xl font-bold text-text-primary mb-1">Verify OTP</h2>
                <p className="text-sm text-text-secondary mb-6">
                  Enter the 6-digit code sent to{' '}
                  <span className="font-medium text-text-primary">
                    {authMethod === 'phone' ? `+91 ${phone}` : email}
                  </span>.
                </p>

                <OtpGrid cells={otpCells} refs={otpRefs}
                  onChange={handleOtpChange} onKey={handleOtpKey} onPaste={handleOtpPaste}
                  error={otpError} />

                <button
                  type="button"
                  onClick={handleVerifyOtp}
                  disabled={otpLoading || otpCells.join('').length < 6}
                  className="btn-primary w-full mt-4"
                >
                  {otpLoading
                    ? <span className="flex items-center justify-center gap-2"><Spinner /> Verifying…</span>
                    : 'Verify & Sign In'}
                </button>

                <div className="flex items-center justify-between mt-4">
                  <button type="button" onClick={handleResendOtp}
                    disabled={otpTimer > 0 || otpSending}
                    className="text-xs transition-colors"
                    style={{ color: otpTimer > 0 ? 'rgba(23,35,43,0.35)' : '#c62832', cursor: otpTimer > 0 ? 'default' : 'pointer' }}>
                    {otpSending ? 'Sending…' : otpTimer > 0 ? `Resend in ${otpTimer}s` : 'Resend OTP'}
                  </button>
                  <button type="button"
                    onClick={() => { setView('login'); setOtpCells(['', '', '', '', '', '']) }}
                    className="text-xs text-text-muted hover:text-text-secondary transition-colors">
                    Change {authMethod === 'phone' ? 'number' : 'email'}
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
                <h2 className="text-xl font-bold text-text-primary mb-1">Create Account</h2>
                <p className="text-sm text-text-secondary mb-5">
                  Register as a MediHawk doctor to access your PHC/CHC portal.
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
                      placeholder="Dr. Full Name"
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
                        placeholder="doctor@medihawk.in"
                        autoComplete="email"
                        onFocus={e => applyFocus(e.target as HTMLInputElement)}
                        onBlur={e  => applyBlur(e.target as HTMLInputElement)}
                      />
                    </div>
                    {sgEmailErr && <p className="text-xs" style={{ color: '#c62832' }}>{sgEmailErr}</p>}
                  </div>

                  {/* Phone */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-text-secondary font-medium" htmlFor="phone">Phone Number</label>
                    <PhoneInput value={sgPhone}
                      onChange={v => { setSgPhone(v); setSgPhoneErr('') }} hasError={!!sgPhoneErr} />
                    {sgPhoneErr && <p className="text-xs" style={{ color: '#c62832' }}>{sgPhoneErr}</p>}
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

                  {/* Medical Registration Number */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-text-secondary font-medium" htmlFor="sg-med-reg">Medical Registration Number</label>
                    <input
                      id="sg-med-reg"
                      type="text"
                      value={sgMedReg}
                      onChange={e => { setSgMedReg(e.target.value); setSgMedRegErr('') }}
                      className={`${iClass} px-3`}
                      style={{ ...BASE_INPUT, ...(sgMedRegErr ? { borderColor: 'rgba(198,40,50,0.60)' } : {}) }}
                      placeholder="e.g. MCI/2024/OD12345"
                      autoComplete="off"
                      onFocus={e => applyFocus(e.target as HTMLInputElement)}
                      onBlur={e  => applyBlur(e.target as HTMLInputElement)}
                    />
                    {sgMedRegErr && <p className="text-xs" style={{ color: '#c62832' }}>{sgMedRegErr}</p>}
                  </div>

                  {/* PHC/CHC Facility ID */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-text-secondary font-medium" htmlFor="sg-phc">Facility ID (PHC/CHC)</label>
                    <input
                      id="sg-phc"
                      type="text"
                      value={sgPhcId}
                      onChange={e => { setSgPhcId(e.target.value); setSgPhcIdErr('') }}
                      className={`${iClass} px-3`}
                      style={{ ...BASE_INPUT, ...(sgPhcIdErr ? { borderColor: 'rgba(198,40,50,0.60)' } : {}) }}
                      placeholder="e.g. phc-chandaka"
                      autoComplete="off"
                      onFocus={e => applyFocus(e.target as HTMLInputElement)}
                      onBlur={e  => applyBlur(e.target as HTMLInputElement)}
                    />
                    {sgPhcIdErr && <p className="text-xs" style={{ color: '#c62832' }}>{sgPhcIdErr}</p>}
                  </div>

                  {/* Invitation Code */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-text-secondary font-medium" htmlFor="sg-inv-code">Invitation Code</label>
                    <p className="text-2xs text-text-muted -mt-0.5">Provided by your facility administrator</p>
                    <input
                      id="sg-inv-code"
                      type="text"
                      value={sgInvCode}
                      onChange={e => { setSgInvCode(e.target.value); setSgInvCodeErr('') }}
                      className={`${iClass} px-3`}
                      style={{ ...BASE_INPUT, ...(sgInvCodeErr ? { borderColor: 'rgba(198,40,50,0.60)' } : {}) }}
                      placeholder="Paste invitation code here"
                      autoComplete="off"
                      onFocus={e => applyFocus(e.target as HTMLInputElement)}
                      onBlur={e  => applyBlur(e.target as HTMLInputElement)}
                    />
                    {sgInvCodeErr && <p className="text-xs" style={{ color: '#c62832' }}>{sgInvCodeErr}</p>}
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
                      : <span className="flex items-center justify-center gap-1.5"><UserPlus size={14} /> Create Account</span>}
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

            {/* ══════════════════ FORGOT — STEP 1: CONTACT ══════════════════ */}
            {view === 'fp-request' && (
              <motion.div key="fp-request"
                initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }}
                transition={{ duration: 0.20 }}
              >
                <h2 className="text-xl font-bold text-text-primary mb-1">Reset Password</h2>
                <p className="text-sm text-text-secondary mb-6">
                  Enter your registered phone number or email to receive a reset code.
                </p>

                <form onSubmit={handleFpRequest} className="flex flex-col gap-4" noValidate>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-text-secondary font-medium" htmlFor="fp-contact">
                      Phone or Email
                    </label>
                    <input
                      id="fp-contact"
                      type="text"
                      value={fpContact}
                      onChange={e => { setFpContact(e.target.value); setFpContactErr('') }}
                      placeholder="Phone number or email address"
                      className={`${iClass} px-3`}
                      style={{ ...BASE_INPUT, ...(fpContactErr ? { borderColor: 'rgba(198,40,50,0.60)' } : {}) }}
                      autoComplete="email"
                      autoFocus
                      onFocus={e => applyFocus(e.target as HTMLInputElement)}
                      onBlur={e  => applyBlur(e.target as HTMLInputElement)}
                    />
                    {fpContactErr && <p className="text-xs" style={{ color: '#c62832' }}>{fpContactErr}</p>}
                  </div>
                  <button type="submit" disabled={fpSending || !fpContact.trim()} className="btn-primary w-full">
                    {fpSending
                      ? <span className="flex items-center justify-center gap-2"><Spinner /> Sending…</span>
                      : 'Send Reset Code'}
                  </button>
                </form>
              </motion.div>
            )}

            {/* ══════════════════ FORGOT — STEP 2: OTP ══════════════════ */}
            {view === 'fp-otp' && (
              <motion.div key="fp-otp"
                initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }}
                transition={{ duration: 0.20 }}
              >
                <h2 className="text-xl font-bold text-text-primary mb-1">Enter reset code</h2>
                <p className="text-sm text-text-secondary mb-6">
                  A 6-digit code was sent to your registered email.
                </p>

                <OtpGrid cells={fpOtpCells} refs={fpOtpRefs}
                  onChange={handleFpOtpChange} onKey={handleFpOtpKey} onPaste={handleFpOtpPaste}
                  error={fpOtpError} />

                <button
                  type="button"
                  onClick={handleFpVerifyOtp}
                  disabled={fpOtpLoading || fpOtpCells.join('').length < 6}
                  className="btn-primary w-full mt-4"
                >
                  {fpOtpLoading
                    ? <span className="flex items-center justify-center gap-2"><Spinner /> Verifying…</span>
                    : 'Verify Code'}
                </button>

                <div className="flex items-center justify-between mt-4">
                  <button type="button" onClick={handleFpOtpResend}
                    disabled={fpOtpTimer > 0 || fpOtpResending}
                    className="text-xs transition-colors"
                    style={{ color: fpOtpTimer > 0 ? 'rgba(23,35,43,0.35)' : '#c62832', cursor: fpOtpTimer > 0 ? 'default' : 'pointer' }}>
                    {fpOtpResending ? 'Sending…' : fpOtpTimer > 0 ? `Resend in ${fpOtpTimer}s` : 'Resend Code'}
                  </button>
                  <button type="button"
                    onClick={() => { setView('fp-request'); setFpOtpCells(['', '', '', '', '', '']) }}
                    className="text-xs text-text-muted hover:text-text-secondary transition-colors">
                    Change contact
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
                  Choose a strong password for your account.
                </p>

                <form onSubmit={handleFpReset} className="flex flex-col gap-4" noValidate>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-text-secondary font-medium" htmlFor="fp-new-pw">New Password</label>
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
                      <button type="button" tabIndex={-1}
                        onClick={() => setFpShowNew(!fpShowNew)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors">
                        {fpShowNew ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    {fpNewPwErr && <p className="text-xs" style={{ color: '#c62832' }}>{fpNewPwErr}</p>}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-text-secondary font-medium" htmlFor="fp-conf-pw">Confirm New Password</label>
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
                      <button type="button" tabIndex={-1}
                        onClick={() => setFpShowConf(!fpShowConf)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors">
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

            {/* ══════════════════ MAIN LOGIN VIEW ══════════════════ */}
            {view === 'login' && (
              <motion.div key="login"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <h2 className="text-xl font-bold text-text-primary mb-1">Doctor Portal</h2>
                <p className="text-sm text-text-secondary mb-5">
                  Access your PHC/CHC medical delivery dashboard.
                </p>

                {/* Segmented control */}
                <div className="flex p-[3px] rounded-lg mb-5"
                  style={{ background: 'rgba(23,35,43,0.07)', border: '1px solid rgba(23,35,43,0.08)' }}>
                  {(['phone', 'email'] as const).map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { setAuthMethod(m); setPhoneErr(''); setEmailErr(''); setFormError('') }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-all"
                      style={authMethod === m ? {
                        background: 'white',
                        color: '#c62832',
                        boxShadow: '0 1px 4px rgba(23,35,43,0.12)',
                        border: '1px solid rgba(198,40,50,0.16)',
                      } : {
                        color: 'rgba(23,35,43,0.50)',
                        border: '1px solid transparent',
                      }}
                    >
                      {m === 'phone' ? <Phone size={12} /> : <Mail size={12} />}
                      {m === 'phone' ? 'Phone' : 'Email'}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleLogin} className="flex flex-col gap-4" noValidate>

                  {/* Phone / Email field */}
                  <AnimatePresence mode="wait">
                    {authMethod === 'phone' ? (
                      <motion.div key="f-phone"
                        initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.14 }}
                        className="flex flex-col gap-1.5"
                      >
                        <label className="text-xs text-text-secondary font-medium" htmlFor="phone">
                          Phone Number
                        </label>
                        <PhoneInput value={phone}
                          onChange={v => { setPhone(v); setPhoneErr('') }} hasError={!!phoneErr} />
                        {phoneErr && <p className="text-xs" style={{ color: '#c62832' }}>{phoneErr}</p>}
                      </motion.div>
                    ) : (
                      <motion.div key="f-email"
                        initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.14 }}
                        className="flex flex-col gap-1.5"
                      >
                        <label className="text-xs text-text-secondary font-medium" htmlFor="email">
                          Email Address
                        </label>
                        <div className="relative">
                          <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                          <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={e => { setEmail(e.target.value); setEmailErr('') }}
                            className={`${iClass} pl-9 pr-4`}
                            style={{ ...BASE_INPUT, ...(emailErr ? { borderColor: 'rgba(198,40,50,0.60)' } : {}) }}
                            placeholder="Enter your email address"
                            autoComplete="email"
                            onFocus={e => applyFocus(e.target as HTMLInputElement)}
                            onBlur={e  => applyBlur(e.target as HTMLInputElement)}
                          />
                        </div>
                        {emailErr && <p className="text-xs" style={{ color: '#c62832' }}>{emailErr}</p>}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Password */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-text-secondary font-medium" htmlFor="password">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => { setView('fp-request'); setFpContact(authMethod === 'email' ? email : '') }}
                        className="text-xs transition-opacity hover:opacity-75"
                        style={{ color: '#c62832' }}
                      >
                        Forgot Password?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                      <input
                        id="password"
                        type={showPw ? 'text' : 'password'}
                        value={password}
                        onChange={e => { setPassword(e.target.value); setPwErr('') }}
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

                  {/* Primary button */}
                  <button type="submit" disabled={loading} className="btn-primary w-full mt-0.5">
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Spinner /> Signing in…
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-1.5">
                        Login to Doctor Portal <ChevronRight size={14} />
                      </span>
                    )}
                  </button>
                </form>

                {/* OR divider */}
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px" style={{ background: 'rgba(23,35,43,0.10)' }} />
                  <span className="text-2xs text-text-muted uppercase tracking-wider">or</span>
                  <div className="flex-1 h-px" style={{ background: 'rgba(23,35,43,0.10)' }} />
                </div>

                {/* OTP button */}
                <button type="button" onClick={handleSendOtp} disabled={otpSending}
                  className="btn-secondary w-full text-sm mb-3">
                  {otpSending ? (
                    <span className="flex items-center justify-center gap-2"><Spinner /> Sending OTP…</span>
                  ) : (
                    <span className="flex items-center justify-center gap-1.5">
                      <MessageSquare size={14} /> Send OTP
                    </span>
                  )}
                </button>

                {/* Sign up link */}
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => { setView('signup'); setSgError('') }}
                    className="text-xs text-text-muted hover:text-text-secondary transition-colors"
                  >
                    New here?{' '}
                    <span style={{ color: '#c62832' }}>Create an account →</span>
                  </button>
                </div>

              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}
