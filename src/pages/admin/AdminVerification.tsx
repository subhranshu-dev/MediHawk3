import { useState } from 'react'
import { motion } from 'framer-motion'
import { CheckSquare, MapPin, User, Key, CheckCircle2, Clock, Package } from 'lucide-react'
import { useStore } from '@/store'
import { useToast } from '@/components/ui/Toast'
import { clsx } from 'clsx'
import { format } from 'date-fns'

export function AdminVerification() {
  const { orders, updateOrderStatus } = useStore()
  const { toast } = useToast()
  const [otpInput, setOtpInput] = useState('')
  const [verified, setVerified] = useState(false)
  const [receiverName, setReceiverName] = useState('Nurse Rajani Pattnaik')

  const deliveredOrder = orders.find((o) => o.status === 'delivered') ?? orders.find((o) => o.status === 'in_flight')

  const geofenceMatch = true
  const otpMatch = otpInput === (deliveredOrder?.otp ?? '847291')
  const receiverFilled = receiverName.length > 3

  const canVerify = geofenceMatch && otpMatch && receiverFilled

  const handleVerify = () => {
    if (!deliveredOrder) return
    updateOrderStatus(deliveredOrder.id, 'verified')
    setVerified(true)
    toast('success', 'Delivery Verified', `Order ${deliveredOrder.id} confirmed at ${deliveredOrder.destination_name}`)
  }

  if (verified) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8 text-center">
        <motion.div
          initial={{ scale: 0 }} animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 180 }}
          className="w-24 h-24 rounded-full bg-med-green/15 border-2 border-med-green flex items-center justify-center"
        >
          <CheckCircle2 size={44} className="text-med-green-light" />
        </motion.div>
        <div>
          <h2 className="text-2xl font-black text-text-primary">DELIVERY VERIFIED</h2>
          <p className="text-text-secondary mt-2">{deliveredOrder?.medicine} · {deliveredOrder?.destination_name}</p>
          <p className="font-mono-data text-sm text-text-muted mt-1">
            {format(new Date(), 'HH:mm:ss · MMM d, yyyy')}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {[
            { label: 'Geofence Match', icon: MapPin, ok: true },
            { label: 'Receiver Verified', icon: User, ok: true },
            { label: 'OTP Verified', icon: Key, ok: true },
          ].map((r) => (
            <div key={r.label} className="flex items-center gap-3 px-4 py-2 rounded bg-med-green/8 border border-med-green/20">
              <r.icon size={14} className="text-med-green-light" />
              <span className="text-sm text-text-primary">{r.label}</span>
              <CheckCircle2 size={14} className="text-med-green-light ml-auto" />
            </div>
          ))}
        </div>
        <button onClick={() => setVerified(false)} className="btn-ghost text-sm">
          New Verification
        </button>
      </div>
    )
  }

  return (
    <div className="p-5 flex flex-col gap-5 overflow-auto max-w-2xl mx-auto">
      <div>
        <h1 className="text-lg font-bold text-text-primary">Delivery Verification</h1>
        <p className="text-xs text-text-secondary mt-0.5">Confirm final delivery at destination</p>
      </div>

      {/* Order info */}
      {deliveredOrder && (
        <div className="panel p-5">
          <div className="flex items-center gap-3 mb-4">
            <Package size={18} className="text-text-secondary" />
            <div>
              <p className="text-sm font-bold text-text-primary">{deliveredOrder.medicine}</p>
              <p className="font-mono-data text-2xs text-text-muted">{deliveredOrder.id}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            {[
              { label: 'Quantity', value: `${deliveredOrder.quantity} ${deliveredOrder.unit}` },
              { label: 'Destination', value: deliveredOrder.destination_name },
              { label: 'Priority', value: deliveredOrder.priority.toUpperCase() },
              { label: 'Drone', value: deliveredOrder.drone_id ?? 'MH-D01' },
            ].map((r) => (
              <div key={r.label}>
                <p className="telemetry-label">{r.label}</p>
                <p className="text-text-primary font-medium">{r.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Verification checks */}
      <div className="flex flex-col gap-3">
        {/* Geofence */}
        <div className={clsx(
          'panel p-4 border flex items-center gap-4',
          geofenceMatch ? 'border-med-green/20 bg-med-green/5' : 'border-amber/20'
        )}>
          <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center', geofenceMatch ? 'bg-med-green/15' : 'bg-amber/15')}>
            <MapPin size={18} className={geofenceMatch ? 'text-med-green-light' : 'text-amber-light'} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-text-primary">Geofence Verification</p>
            <p className="text-xs text-text-muted">PHC Chandaka · 20.3512, 85.7612</p>
          </div>
          <span className={clsx('text-xs font-bold uppercase px-2 py-1 rounded border',
            geofenceMatch ? 'text-med-green bg-med-green-glow border-med-green/30' : 'text-amber bg-amber-glow border-amber/30')}>
            {geofenceMatch ? 'VERIFIED' : 'CHECKING'}
          </span>
        </div>

        {/* Receiver */}
        <div className="panel p-4">
          <div className="flex items-center gap-3 mb-3">
            <User size={16} className="text-text-secondary" />
            <p className="text-sm font-semibold text-text-primary">Receiver Identity</p>
          </div>
          <input
            type="text"
            value={receiverName}
            onChange={(e) => setReceiverName(e.target.value)}
            placeholder="Enter receiver name..."
            className="w-full px-4 py-2.5 rounded bg-slate border border-white/10 text-text-primary text-sm outline-none focus:border-white/20"
          />
          {receiverFilled && (
            <p className="text-xs text-med-green-light mt-1.5 flex items-center gap-1">
              <CheckCircle2 size={11} /> Receiver identity recorded
            </p>
          )}
        </div>

        {/* OTP */}
        <div className={clsx('panel p-4 border', otpMatch ? 'border-med-green/20' : 'border-white/8')}>
          <div className="flex items-center gap-3 mb-3">
            <Key size={16} className="text-text-secondary" />
            <p className="text-sm font-semibold text-text-primary">OTP Verification</p>
            <span className="text-2xs text-text-muted">Sent to receiver's registered mobile</span>
          </div>
          <div className="flex gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <input
                key={i}
                type="text"
                maxLength={1}
                value={otpInput[i] ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  const newOtp = otpInput.split('')
                  newOtp[i] = v
                  setOtpInput(newOtp.join('').substring(0, 6))
                  if (v && i < 5) {
                    const next = document.getElementById(`otp-${i + 1}`)
                    next?.focus()
                  }
                }}
                id={`otp-${i}`}
                className={clsx(
                  'w-12 h-12 text-center font-mono-data font-bold text-lg rounded border outline-none transition-all',
                  'bg-slate text-text-primary',
                  otpInput[i]
                    ? otpMatch && otpInput.length === 6 ? 'border-med-green text-med-green-light' : 'border-crimson/50'
                    : 'border-white/15 focus:border-white/30'
                )}
              />
            ))}
          </div>
          {otpInput.length === 6 && (
            <p className={clsx('text-xs mt-2 flex items-center gap-1', otpMatch ? 'text-med-green-light' : 'text-crimson-light')}>
              {otpMatch ? <><CheckCircle2 size={11} /> OTP verified</> : '✕ Invalid OTP — check and retry'}
            </p>
          )}
          {!otpInput && (
            <p className="text-2xs text-text-muted mt-2">Demo OTP: {deliveredOrder?.otp ?? '847291'}</p>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="panel p-4">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Verification Summary</h3>
        <div className="flex flex-col gap-2">
          {[
            { label: 'Geofence Match', ok: geofenceMatch },
            { label: 'Receiver Identified', ok: receiverFilled },
            { label: 'OTP Verified', ok: otpMatch && otpInput.length === 6 },
          ].map((r) => (
            <div key={r.label} className="flex items-center justify-between text-xs">
              <span className="text-text-secondary">{r.label}</span>
              <span className={r.ok ? 'text-med-green-light font-bold' : 'text-text-muted'}>
                {r.ok ? '✓ VERIFIED' : '— PENDING'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={handleVerify}
        disabled={!canVerify}
        className={clsx('w-full py-3 rounded font-bold text-sm tracking-wide transition-all',
          canVerify ? 'btn-green' : 'bg-white/5 text-text-muted border border-white/10 cursor-not-allowed')}
      >
        {canVerify ? <><CheckSquare size={16} /> CONFIRM RECEIPT</> : 'Complete all verifications to confirm'}
      </button>
    </div>
  )
}
