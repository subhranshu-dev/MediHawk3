import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSearchParams } from 'react-router-dom'
import { Search, CheckCircle2, XCircle, Eye, AlertTriangle, Loader2, ShieldCheck, Clock, Radio } from 'lucide-react'
import { useStore } from '@/store'
import { useToast } from '@/components/ui/Toast'
import { orderStatusBadge, priorityBadge } from '@/components/ui/StatusBadge'
import { orderService } from '@/services/api'
import { Modal } from '@/components/ui/Modal'
import { INSPECTION_CHECKS } from '@/data/mockData'
import type { Order, InspectionCheck } from '@/types'
import { format } from 'date-fns'
import { clsx } from 'clsx'

/* ── Inspection check row ─────────────────────────────────────────────────── */
function CheckRow({ check }: { check: InspectionCheck }) {
  const isPass    = check.status === 'pass'
  const isBlocked = check.status === 'blocked'
  const isWarning = check.status === 'warning'

  return (
    <div className={clsx(
      'flex items-center gap-3.5 px-3.5 py-2.5 rounded-md border',
      'transition-all duration-150 cursor-default',
      'hover:-translate-y-px hover:shadow-sm',
      isPass    ? 'bg-[rgba(31,157,104,0.055)] border-[rgba(31,157,104,0.15)] hover:bg-[rgba(31,157,104,0.08)] hover:border-[rgba(31,157,104,0.22)]' :
      isBlocked ? 'bg-[rgba(198,40,50,0.07)] border-[rgba(198,40,50,0.22)] hover:bg-[rgba(198,40,50,0.1)]' :
      isWarning ? 'bg-[rgba(217,119,6,0.06)] border-[rgba(217,119,6,0.18)] hover:bg-[rgba(217,119,6,0.09)]' :
                  'bg-black/[0.025] border-white/[0.07] hover:bg-black/[0.04]'
    )}>

      {/* Status icon */}
      <div className={clsx(
        'w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center',
        'text-[11px] font-bold select-none transition-all',
        isPass    ? 'bg-[rgba(31,157,104,0.15)] text-[#34d399]' :
        isBlocked ? 'bg-[rgba(198,40,50,0.15)] text-[#f87171]' :
        isWarning ? 'bg-[rgba(217,119,6,0.15)] text-[#fbbf24]' :
                    'bg-black/[0.08] text-text-muted'
      )}>
        {isPass ? '✓' : isBlocked ? '✕' : isWarning ? '!' : '·'}
      </div>

      {/* Label + detail */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={clsx(
            'text-xs font-semibold leading-none',
            isPass    ? 'text-text-primary' :
            isBlocked ? 'text-[#fca5a5]'   :
            isWarning ? 'text-[#fcd34d]'   :
                        'text-text-secondary'
          )}>
            {check.label}
          </span>
          {!check.mandatory && (
            <span className="text-[9px] text-text-muted px-1.5 py-0.5 rounded-sm leading-none"
              style={{ background: 'rgba(0,0,0,0.08)', letterSpacing: '0.04em' }}>
              optional
            </span>
          )}
        </div>
        {check.detail && (
          <p className="text-[10px] text-text-muted mt-0.5 leading-relaxed">{check.detail}</p>
        )}
      </div>

      {/* Status badge */}
      <span className={clsx(
        'flex-shrink-0 text-[9px] font-bold uppercase tracking-[0.1em]',
        'px-2 py-1 rounded-sm leading-none',
        isPass    ? 'bg-[rgba(31,157,104,0.12)] text-[#34d399]'   :
        isBlocked ? 'bg-[rgba(198,40,50,0.12)] text-[#f87171]'    :
        isWarning ? 'bg-[rgba(217,119,6,0.12)] text-[#fbbf24]'    :
                    'bg-black/[0.07] text-text-muted'
      )}>
        {isPass ? 'PASS' : isBlocked ? 'BLOCKED' : isWarning ? 'WARN' : 'PENDING'}
      </span>
    </div>
  )
}

/* ── Section divider ──────────────────────────────────────────────────────── */
function CheckSection({ label, count, passed }: { label: string; count: number; passed: number }) {
  const allPass = passed === count
  return (
    <div className="flex items-center gap-2 pt-3 pb-0.5">
      <div className="flex-1 h-px" style={{ background: 'rgba(67,88,99,0.16)' }} />
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-[9px] font-semibold text-text-muted uppercase tracking-[0.12em]">{label}</span>
        <span className={clsx(
          'text-[9px] font-mono px-1.5 py-0.5 rounded-sm leading-none',
          allPass
            ? 'bg-[rgba(31,157,104,0.1)] text-[#34d399]'
            : 'bg-black/[0.06] text-text-muted'
        )}>
          {passed}/{count}
        </span>
      </div>
      <div className="flex-1 h-px" style={{ background: 'rgba(67,88,99,0.16)' }} />
    </div>
  )
}

/* ── Main inspection modal ────────────────────────────────────────────────── */
type InspectionStep = 'review' | 'confirm' | 'authorizing' | 'error'

function InspectionModal({ order, onClose, onLaunch, onCancel }: {
  order: Order; onClose: () => void; onLaunch: () => void; onCancel: () => void
}) {
  const [checks]                          = useState<InspectionCheck[]>(INSPECTION_CHECKS)
  const [step, setStep]                   = useState<InspectionStep>('review')
  const [errorMsg, setErrorMsg]           = useState('')
  const [feedback, setFeedback]           = useState('')
  const [feedbackSaved, setFeedbackSaved] = useState(false)
  const fbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (fbTimerRef.current) clearTimeout(fbTimerRef.current) }, [])

  const mandatory        = checks.filter(c => c.mandatory)
  const allMandatoryPass = mandatory.every(c => c.status === 'pass')
  const hasBlocked       = checks.some(c => c.status === 'blocked')
  const pendingMandatory = mandatory.filter(c => c.status === 'pending')
  const canLaunch        = allMandatoryPass && !hasBlocked

  const blockedReason: string | null = hasBlocked
    ? `${checks.find(c => c.status === 'blocked')?.label} — check failed`
    : pendingMandatory.length > 0
    ? `${pendingMandatory.length} mandatory check${pendingMandatory.length > 1 ? 's' : ''} not yet completed`
    : null

  const hardwareChecks = checks.filter(c => ['propeller', 'airframe', 'battery_mount'].includes(c.id))
  const payloadChecks  = checks.filter(c => ['medicine', 'quantity', 'expiry', 'temperature', 'sealed', 'mounted'].includes(c.id))
  const systemChecks   = checks.filter(c => ['battery', 'gps', 'weather', '4g', 'zerotier'].includes(c.id))

  const hwPassed  = hardwareChecks.filter(c => c.status === 'pass').length
  const payPassed = payloadChecks.filter(c => c.status === 'pass').length
  const sysPassed = systemChecks.filter(c => c.status === 'pass').length

  const handleAuthorize = async () => {
    setStep('authorizing')
    try {
      // Integration-ready: POST /api/mission/launch { orderId: order.id }
      await new Promise(r => setTimeout(r, 1400))
      onLaunch()
    } catch {
      setErrorMsg('Command Center unavailable. Mission command could not be sent.')
      setStep('error')
    }
  }

  const handleSaveFeedback = () => {
    if (!feedback.trim()) return
    // Integration-ready: POST /api/orders/${order.id}/feedback { note: feedback, timestamp: new Date().toISOString() }
    setFeedbackSaved(true)
    fbTimerRef.current = setTimeout(() => setFeedbackSaved(false), 2500)
  }

  return (
    /* Outer scroll container — no inner height caps on the checklist */
    <div
      style={{ maxHeight: 'calc(82vh - 110px)', overflowY: 'auto', overflowX: 'hidden' }}
      className="pr-1 scrollbar-thin"
    >
      <AnimatePresence mode="wait">

        {/* ══ REVIEW ══ */}
        {step === 'review' && (
          <motion.div
            key="review"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="flex flex-col gap-5"
          >

            {/* ─── Readiness banner ─────────────────────────────────────────── */}
            <div
              className={clsx(
                'flex items-center gap-4 py-4 px-5 rounded-lg border',
                'transition-all duration-300',
                canLaunch  ? 'border-[rgba(31,157,104,0.28)]' :
                hasBlocked ? 'border-[rgba(198,40,50,0.28)]' :
                             'border-[rgba(217,119,6,0.26)]'
              )}
              style={{
                background: canLaunch
                  ? 'linear-gradient(135deg,rgba(31,157,104,0.07) 0%,rgba(31,157,104,0.03) 100%)'
                  : hasBlocked
                  ? 'linear-gradient(135deg,rgba(198,40,50,0.08) 0%,rgba(198,40,50,0.03) 100%)'
                  : 'linear-gradient(135deg,rgba(217,119,6,0.07) 0%,rgba(217,119,6,0.03) 100%)',
                boxShadow: canLaunch
                  ? '0 0 20px rgba(31,157,104,0.06), inset 0 0 0 1px rgba(31,157,104,0.06)'
                  : 'none',
              }}
            >
              {canLaunch
                ? <ShieldCheck size={22} className="flex-shrink-0" style={{ color: '#34d399' }} />
                : hasBlocked
                ? <XCircle    size={22} className="text-crimson-light flex-shrink-0" />
                : <Clock      size={22} className="flex-shrink-0" style={{ color: '#fbbf24' }} />
              }
              <div className="flex-1">
                <p
                  className="font-bold text-sm tracking-[0.06em] uppercase"
                  style={{
                    color: canLaunch ? '#34d399' : hasBlocked ? undefined : '#fbbf24',
                  }}
                >
                  {canLaunch ? 'Mission Ready' : hasBlocked ? 'Launch Blocked' : 'Checks Pending'}
                </p>
                <p className="text-[10px] text-text-muted mt-0.5 leading-relaxed">
                  {canLaunch
                    ? 'All mandatory pre-flight requirements verified. Clear for authorization.'
                    : blockedReason ?? 'Complete all mandatory checks before launch.'}
                </p>
              </div>
              <div
                className="flex-shrink-0 text-[10px] font-mono font-bold px-2.5 py-1 rounded-sm"
                style={{
                  background: canLaunch
                    ? 'rgba(31,157,104,0.12)'
                    : hasBlocked ? 'rgba(198,40,50,0.12)' : 'rgba(217,119,6,0.1)',
                  color: canLaunch ? '#34d399' : hasBlocked ? '#f87171' : '#fbbf24',
                }}
              >
                {mandatory.filter(c => c.status === 'pass').length}/{mandatory.length}
              </div>
            </div>

            {/* ─── Mission information ──────────────────────────────────────── */}
            <div>
              <p className="text-[9px] font-semibold text-text-muted uppercase tracking-[0.12em] mb-2">
                Mission Information
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Order ID',    value: order.id },
                  { label: 'Medicine',    value: order.medicine },
                  { label: 'Quantity',    value: `${order.quantity} ${order.unit}` },
                  { label: 'Destination', value: order.destination_name },
                  { label: 'Priority',    value: order.priority.toUpperCase() },
                  { label: 'Drone',       value: 'MH-D02 · Hawk Beta' },
                ].map(r => (
                  <div key={r.label} className="panel-elevated rounded-md p-2.5">
                    <p className="telemetry-label mb-0.5">{r.label}</p>
                    <p className="text-text-primary font-semibold text-xs truncate" title={r.value}>
                      {r.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* ─── Pre-Flight Inspection ────────────────────────────────────── */}
            {/* No maxHeight here — the outer scroll container handles overflow  */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] font-semibold text-text-muted uppercase tracking-[0.12em]">
                  Pre-Flight Inspection
                </p>
                <span className="text-[9px] text-text-muted font-mono">
                  {mandatory.filter(c => c.status === 'pass').length}/{mandatory.length} required
                  &nbsp;·&nbsp;
                  {checks.filter(c => c.status === 'pass').length}/{checks.length} total
                </span>
              </div>

              <div className="flex flex-col gap-1">
                {hardwareChecks.length > 0 && (
                  <>
                    <CheckSection label="Airframe & Hardware" count={hardwareChecks.length} passed={hwPassed} />
                    {hardwareChecks.map(c => <CheckRow key={c.id} check={c} />)}
                  </>
                )}
                {payloadChecks.length > 0 && (
                  <>
                    <CheckSection label="Payload & Medical" count={payloadChecks.length} passed={payPassed} />
                    {payloadChecks.map(c => <CheckRow key={c.id} check={c} />)}
                  </>
                )}
                {systemChecks.length > 0 && (
                  <>
                    <CheckSection label="Systems & Connectivity" count={systemChecks.length} passed={sysPassed} />
                    {systemChecks.map(c => <CheckRow key={c.id} check={c} />)}
                  </>
                )}
              </div>
            </div>

            {/* ─── Mission Authorization ────────────────────────────────────── */}
            <div
              className={clsx(
                'flex flex-col gap-3 p-4 rounded-lg border transition-all duration-300',
                canLaunch ? 'border-[rgba(198,40,50,0.2)]' : 'border-white/[0.06]'
              )}
              style={{
                background: canLaunch
                  ? 'linear-gradient(160deg,rgba(198,40,50,0.05) 0%,rgba(0,0,0,0.01) 100%)'
                  : 'rgba(0,0,0,0.015)',
                boxShadow: canLaunch
                  ? '0 0 24px rgba(198,40,50,0.05), inset 0 0 0 1px rgba(198,40,50,0.04)'
                  : 'none',
              }}
            >
              <div className="flex items-center justify-between">
                <p className="text-[9px] font-semibold text-text-muted uppercase tracking-[0.12em]">
                  Mission Authorization
                </p>
                {canLaunch && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-1.5"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: '#34d399', boxShadow: '0 0 6px rgba(52,211,153,0.6)' }}
                    />
                    <span className="text-[9px] font-semibold uppercase tracking-[0.08em]"
                      style={{ color: '#34d399' }}>
                      Authorization Ready
                    </span>
                  </motion.div>
                )}
              </div>

              {!canLaunch && blockedReason && (
                <div
                  className="flex items-start gap-2 px-3 py-2.5 rounded-md border text-xs"
                  style={{ background: 'rgba(198,40,50,0.05)', borderColor: 'rgba(198,40,50,0.15)' }}
                  role="alert"
                  aria-live="polite"
                >
                  <AlertTriangle size={13} className="text-crimson flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="font-semibold text-crimson-light text-xs">Launch Blocked</p>
                    <p className="text-[10px] text-text-muted mt-0.5">{blockedReason}</p>
                  </div>
                </div>
              )}

              <button
                onClick={() => setStep('confirm')}
                disabled={!canLaunch}
                aria-label={
                  canLaunch
                    ? 'Confirm and launch mission'
                    : `Launch blocked: ${blockedReason ?? 'pre-flight incomplete'}`
                }
                aria-disabled={!canLaunch}
                className={clsx(
                  'w-full flex items-center justify-center gap-2.5',
                  'text-sm font-bold tracking-[0.06em] uppercase',
                  'py-3.5 rounded-md border',
                  'transition-all duration-200',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
                  'focus-visible:ring-offset-transparent',
                  canLaunch
                    ? [
                        'bg-crimson text-white border-[rgba(198,40,50,0.5)]',
                        'hover:bg-[#b01e27] active:scale-[0.99]',
                        'focus-visible:ring-[rgba(198,40,50,0.5)]',
                      ]
                    : [
                        'bg-white/[0.03] text-text-muted border-white/[0.07]',
                        'cursor-not-allowed',
                        'focus-visible:ring-white/20',
                      ]
                )}
                style={canLaunch ? {
                  boxShadow: '0 2px 18px rgba(198,40,50,0.3), 0 1px 4px rgba(198,40,50,0.2)',
                } : {}}
              >
                <CheckCircle2 size={16} aria-hidden="true" />
                Confirm &amp; Launch
              </button>
            </div>

            {/* ─── Mission Feedback ─────────────────────────────────────────── */}
            <div className="flex flex-col gap-2.5 pt-1 border-t border-white/[0.06]">
              <div className="flex items-center justify-between">
                <p className="text-[9px] font-semibold text-text-muted uppercase tracking-[0.12em]">
                  Mission Feedback
                </p>
                <p className="text-[9px] text-text-muted opacity-70">
                  Recorded against {order.id}
                </p>
              </div>
              <textarea
                value={feedback}
                onChange={e => { setFeedback(e.target.value); setFeedbackSaved(false) }}
                rows={3}
                className={clsx(
                  'w-full rounded-md text-xs text-text-primary',
                  'bg-slate border border-white/[0.09]',
                  'outline-none resize-none',
                  'focus:border-white/[0.2]',
                  'p-3 transition-colors leading-relaxed'
                )}
                placeholder="Add an operational note, inspection observation, or mission remark…"
                aria-label="Mission operational feedback"
              />
              <div className="flex justify-end">
                <button
                  onClick={handleSaveFeedback}
                  disabled={!feedback.trim() || feedbackSaved}
                  aria-label="Save mission feedback"
                  className={clsx(
                    'btn-secondary text-xs py-1.5 px-3 transition-all duration-200',
                    feedbackSaved && 'border-[rgba(31,157,104,0.3)]'
                  )}
                  style={feedbackSaved ? { color: '#34d399' } : {}}
                >
                  {feedbackSaved ? (
                    <><CheckCircle2 size={11} className="inline mr-1.5" aria-hidden="true" />Saved</>
                  ) : (
                    'Save Feedback'
                  )}
                </button>
              </div>
            </div>

            {/* ─── Cancel ──────────────────────────────────────────────────── */}
            <button onClick={onCancel} className="btn-danger w-full">
              <XCircle size={15} aria-hidden="true" />
              Cancel Mission
            </button>
          </motion.div>
        )}

        {/* ══ CONFIRM ══ */}
        {step === 'confirm' && (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="flex flex-col gap-5"
          >
            <div className="text-center pt-2">
              <p
                className="text-[9px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: '#c62832' }}
              >
                Authorize Autonomous Mission
              </p>
              <p className="text-lg font-bold text-text-primary mt-1.5 leading-tight">
                Confirm Mission Launch
              </p>
              <p className="text-sm text-text-secondary mt-1">
                This action will initiate an autonomous drone delivery mission.
              </p>
            </div>

            {/* Mission summary */}
            <div
              className="rounded-lg border overflow-hidden"
              style={{ borderColor: 'rgba(67,88,99,0.2)', background: 'rgba(255,255,255,0.02)' }}
            >
              {[
                { label: 'Medicine',    value: order.medicine },
                { label: 'Quantity',    value: `${order.quantity} ${order.unit}` },
                { label: 'Destination', value: order.destination_name },
                { label: 'Priority',    value: order.priority.toUpperCase() },
                { label: 'Drone',       value: 'MH-D02 · Hawk Beta' },
                { label: 'Pre-flight',  value: 'All required checks passed' },
              ].map((r, i, arr) => (
                <div
                  key={r.label}
                  className={clsx(
                    'flex items-center justify-between px-4 py-2.5',
                    i < arr.length - 1 && 'border-b border-white/[0.05]'
                  )}
                >
                  <span className="telemetry-label">{r.label}</span>
                  <span
                    className="text-xs font-semibold"
                    style={{ color: r.label === 'Pre-flight' ? '#34d399' : undefined }}
                  >
                    {r.value}
                  </span>
                </div>
              ))}
            </div>

            {/* Safety notice */}
            <div
              className="flex items-start gap-2.5 px-3.5 py-3 rounded-lg border text-xs"
              style={{ background: 'rgba(198,40,50,0.05)', borderColor: 'rgba(198,40,50,0.16)' }}
              role="note"
            >
              <AlertTriangle size={14} className="text-crimson flex-shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-text-secondary leading-relaxed">
                Confirm that the launch area is clear and all personnel are informed.
                Once authorized, the drone will proceed autonomously.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep('review')}
                className="btn-secondary flex-1"
                aria-label="Go back to inspection review"
              >
                ← Back
              </button>
              <button
                onClick={handleAuthorize}
                aria-label="Authorize autonomous mission launch"
                className="btn-primary flex-1"
                style={{ boxShadow: '0 2px 16px rgba(198,40,50,0.3)' }}
              >
                <CheckCircle2 size={15} aria-hidden="true" />
                Authorize Launch
              </button>
            </div>
          </motion.div>
        )}

        {/* ══ AUTHORIZING ══ */}
        {step === 'authorizing' && (
          <motion.div
            key="authorizing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="flex flex-col items-center justify-center gap-6 py-16"
            role="status"
            aria-label="Authorizing mission, please wait"
          >
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{
                background: 'rgba(198,40,50,0.08)',
                border: '1px solid rgba(198,40,50,0.22)',
                boxShadow: '0 0 0 6px rgba(198,40,50,0.04)',
              }}
            >
              <Loader2 size={26} className="animate-spin" style={{ color: '#c62832' }} />
            </div>
            <div className="text-center">
              <p className="text-base font-bold text-text-primary">Authorizing Mission</p>
              <p className="text-sm text-text-muted mt-1.5">
                Sending launch command to Command Center…
              </p>
            </div>
          </motion.div>
        )}

        {/* ══ ERROR ══ */}
        {step === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="flex flex-col gap-5"
            role="alert"
            aria-live="assertive"
          >
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(198,40,50,0.10)', border: '1px solid rgba(198,40,50,0.24)' }}
              >
                <XCircle size={28} className="text-crimson-light" />
              </div>
              <div>
                <p className="font-bold text-text-primary text-base">Launch Command Failed</p>
                <p className="text-sm text-text-secondary mt-1 max-w-xs mx-auto leading-relaxed">
                  {errorMsg}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep('review')}
                className="btn-secondary flex-1"
                aria-label="Return to inspection review"
              >
                Review Checks
              </button>
              <button
                onClick={() => { setErrorMsg(''); setStep('confirm') }}
                className="btn-primary flex-1"
                aria-label="Retry launch authorization"
              >
                <Radio size={14} aria-hidden="true" />
                Retry
              </button>
            </div>
            <button
              onClick={onClose}
              className="btn-danger w-full"
              aria-label="Cancel mission"
            >
              <XCircle size={15} aria-hidden="true" />
              Cancel Mission
            </button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}

/* ── Orders page ──────────────────────────────────────────────────────────── */
export function AdminOrders() {
  const { orders, updateOrderStatus, addOrder } = useStore()
  const { toast }                               = useToast()
  const [searchParams]                          = useSearchParams()
  const [filter, setFilter]                     = useState<'all' | 'pending' | 'active' | 'completed'>('all')
  const [search, setSearch]                     = useState('')
  const [inspecting, setInspecting]             = useState<Order | null>(null)
  const [expanded, setExpanded]                 = useState<string | null>(null)

  // Load all orders from backend on mount
  useEffect(() => {
    orderService.list()
      .then(fetched => {
        fetched.forEach(o => {
          if (!orders.find(ex => ex.id === o.id)) addOrder(o)
        })
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const reviewId = searchParams.get('review')
    if (!reviewId) return
    const order = orders.find(o => o.id === reviewId)
    if (order) {
      if (order.status === 'pending') setFilter('pending')
      setInspecting(order)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = orders.filter(o => {
    const matchFilter =
      filter === 'all'       ? true :
      filter === 'pending'   ? o.status === 'pending' :
      filter === 'active'    ? ['approved', 'preparing', 'launched', 'in_flight'].includes(o.status) :
                               ['delivered', 'verified'].includes(o.status)
    const matchSearch = search
      ? o.medicine.toLowerCase().includes(search.toLowerCase()) ||
        o.id.toLowerCase().includes(search.toLowerCase())
      : true
    return matchFilter && matchSearch
  })

  const handleLaunch = async (order: Order) => {
    try {
      await orderService.confirm(order.id)
      updateOrderStatus(order.id, 'approved')
      setInspecting(null)
      toast('success', `Order confirmed: ${order.id}`, `${order.medicine} approved for dispatch`)
    } catch (err) {
      const e = err as { message?: string }
      toast('error', 'Confirm failed', e.message ?? 'Could not confirm order')
    }
  }

  const handleCancel = async (order: Order) => {
    try {
      await orderService.cancel(order.id)
      updateOrderStatus(order.id, 'cancelled')
      setInspecting(null)
      toast('info', `Order cancelled: ${order.id}`, 'The order has been cancelled')
    } catch (err) {
      const e = err as { message?: string }
      toast('error', 'Cancel failed', e.message ?? 'Could not cancel order')
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-text-primary">Orders</h1>
          <p className="text-xs text-text-secondary">
            {orders.length} total · {orders.filter(o => o.status === 'pending').length} pending
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search orders…"
              aria-label="Search orders by medicine name or ID"
              className="pl-8 pr-4 py-2 rounded bg-slate border border-white/10 text-text-primary text-xs
                outline-none focus:border-white/20 w-48"
            />
          </div>
          {(['all', 'pending', 'active', 'completed'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={clsx(
                'px-3 py-1.5 rounded text-xs font-semibold capitalize transition-all',
                filter === f
                  ? 'bg-crimson text-white'
                  : 'bg-white/8 text-text-secondary hover:bg-white/12'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Orders table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full" role="table" aria-label="Orders list">
          <thead>
            <tr className="border-b border-white/6">
              {['Order ID', 'Medicine', 'Qty', 'Destination', 'Priority', 'Status', 'Ordered', 'Actions'].map(h => (
                <th
                  key={h}
                  scope="col"
                  className="px-4 py-3 text-left text-2xs text-text-muted font-semibold uppercase tracking-wider"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((order, i) => (
              <>
                <motion.tr
                  key={order.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className="border-b border-white/4 hover:bg-white/2 transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="font-mono-data text-xs text-text-primary">{order.id}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs font-medium text-text-primary">{order.medicine}</p>
                    <p className="text-2xs text-text-muted">{order.doctor_name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono-data text-xs text-text-primary">
                      {order.quantity} {order.unit}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-text-secondary">{order.destination_name}</span>
                  </td>
                  <td className="px-4 py-3">{priorityBadge(order.priority)}</td>
                  <td className="px-4 py-3">{orderStatusBadge(order.status)}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono-data text-2xs text-text-muted">
                      {format(new Date(order.ordered_at), 'HH:mm:ss')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {order.status === 'pending' && (
                        <button
                          onClick={() => setInspecting(order)}
                          className="btn-primary text-xs py-1 px-2"
                          aria-label={`Inspect order ${order.id}`}
                        >
                          INSPECT
                        </button>
                      )}
                      <button
                        onClick={() => setExpanded(expanded === order.id ? null : order.id)}
                        className="btn-ghost py-1 px-2"
                        aria-label={expanded === order.id ? `Collapse details for ${order.id}` : `Expand details for ${order.id}`}
                        aria-expanded={expanded === order.id}
                      >
                        <Eye size={12} aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </motion.tr>

                {/* Expanded row detail */}
                <AnimatePresence>
                  {expanded === order.id && (
                    <tr key={`${order.id}-detail`}>
                      <td colSpan={8} className="px-4 py-0">
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="py-3 grid grid-cols-4 gap-4 bg-white/2 rounded my-1 px-4 text-xs">
                            <div>
                              <p className="telemetry-label">Doctor</p>
                              <p className="text-text-primary">{order.doctor_name}</p>
                            </div>
                            <div>
                              <p className="telemetry-label">Drone</p>
                              <p className="text-text-primary">{order.drone_id ?? '—'}</p>
                            </div>
                            <div>
                              <p className="telemetry-label">Delivered</p>
                              <p className="text-text-primary">
                                {order.delivered_at
                                  ? format(new Date(order.delivered_at), 'HH:mm:ss')
                                  : '—'}
                              </p>
                            </div>
                            <div>
                              <p className="telemetry-label">Delivery Time</p>
                              <p className="text-text-primary">
                                {order.delivery_time_minutes
                                  ? `${order.delivery_time_minutes} min`
                                  : '—'}
                              </p>
                            </div>
                            {order.notes && (
                              <div className="col-span-4">
                                <p className="telemetry-label">Notes</p>
                                <p className="text-text-secondary">{order.notes}</p>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      </td>
                    </tr>
                  )}
                </AnimatePresence>
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Inspection modal */}
      <Modal
        open={!!inspecting}
        onClose={() => setInspecting(null)}
        title="Mission Readiness — Pre-Flight Inspection"
        subtitle={inspecting ? `Order ${inspecting.id} · ${inspecting.medicine}` : ''}
        size="xl"
      >
        {inspecting && (
          <InspectionModal
            order={inspecting}
            onClose={() => setInspecting(null)}
            onLaunch={() => handleLaunch(inspecting)}
            onCancel={() => handleCancel(inspecting)}
          />
        )}
      </Modal>
    </div>
  )
}
