import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Package, ChevronDown, ChevronUp, AlertTriangle,
  ArrowLeft, ArrowRight, CheckCircle, MapPin, Navigation as NavIcon
} from 'lucide-react'
import { useStore } from '@/store'
import { useToast } from '@/components/ui/Toast'
import type { OrderPriority } from '@/types'

const MEDICINES = [
  { category: 'Emergency Medicine', items: ['Polyvalent Antivenin', 'Adrenaline 1:1000', 'Atropine Sulfate', 'Naloxone'] },
  { category: 'Maternal Health', items: ['Oxytocin', 'Misoprostol', 'Magnesium Sulfate'] },
  { category: 'Vaccines', items: ['OPV Vaccine', 'MMR Vaccine', 'Hepatitis B', 'BCG'] },
  { category: 'Blood / Supply', items: ['O+ Blood Pack', 'AB+ Blood Pack', 'FFP'] },
  { category: 'General Emergency', items: ['Insulin Regular', 'Morphine Sulfate', 'Hydrocortisone'] },
]

const PRIORITIES: { value: OrderPriority; label: string; desc: string; color: string }[] = [
  { value: 'emergency', label: 'Emergency', desc: 'Life-threatening. Highest priority.', color: 'border-crimson/40 bg-crimson/10 text-crimson-light' },
  { value: 'urgent', label: 'Urgent', desc: 'Time-sensitive. Prioritized dispatch.', color: 'border-amber/40 bg-amber/10 text-amber-light' },
  { value: 'normal', label: 'Normal', desc: 'Routine delivery. Standard queue.', color: 'border-white/15 bg-white/5 text-text-secondary' },
]

type Step = 'select' | 'details' | 'confirm' | 'success'

export function DoctorOrder() {
  const [step, setStep] = useState<Step>('select')
  const [selectedMedicine, setSelectedMedicine] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [priority, setPriority] = useState<OrderPriority>('emergency')
  const [notes, setNotes] = useState('')
  const [expandedCat, setExpandedCat] = useState<string | null>('Emergency Medicine')
  const [submitting, setSubmitting] = useState(false)
  const [orderId, setOrderId] = useState('')

  const { user, addOrder, orders } = useStore()
  const navigate = useNavigate()
  const { toast } = useToast()

  const handleSubmit = async () => {
    setSubmitting(true)
    await new Promise((r) => setTimeout(r, 1000))
    const id = `MH-2026-00${422 + orders.length}`
    setOrderId(id)
    addOrder({
      id,
      doctor_id: user?.id ?? '',
      doctor_name: user?.name ?? '',
      from_location: 'hub-01',
      from_location_name: 'MediHawk Central Hub',
      destination_location: 'phc-chandaka',
      destination_name: 'PHC Chandaka',
      medicine: selectedMedicine,
      quantity,
      unit: 'units',
      priority,
      status: 'pending',
      inspection_done: false,
      qr_verified: false,
      temperature: 0,
      ordered_at: new Date().toISOString(),
      notes,
      otp: Math.floor(100000 + Math.random() * 900000).toString(),
    })
    setStep('success')
    setSubmitting(false)
    toast('success', `Order ${id} submitted`, 'Awaiting mission approval')
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => step === 'select' ? navigate('/doctor') : setStep('select')}
          className="btn-ghost p-1.5 pl-0">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-text-primary">Request Medical Delivery</h1>
          <p className="text-xs text-text-secondary">PHC Chandaka → MediHawk Hub</p>
        </div>
      </div>

      {/* Step indicator */}
      {step !== 'success' && (
        <div className="flex items-center gap-2">
          {(['select', 'details', 'confirm'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                ${step === s ? 'bg-crimson text-white' : step === 'confirm' && i < 2 || (step === 'details' && i < 1)
                  ? 'bg-med-green text-white' : 'bg-white/10 text-text-muted'}`}>
                {i + 1}
              </div>
              {i < 2 && <div className="flex-1 h-px bg-white/10 w-8" />}
            </div>
          ))}
        </div>
      )}

      <AnimatePresence mode="wait">
        {/* ── Step 1: Select Medicine ── */}
        {step === 'select' && (
          <motion.div key="select"
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            className="flex flex-col gap-3"
          >
            <h2 className="text-sm font-semibold text-text-secondary">Select Medicine</h2>
            {MEDICINES.map((cat) => (
              <div key={cat.category} className="panel overflow-hidden">
                <button
                  onClick={() => setExpandedCat(expandedCat === cat.category ? null : cat.category)}
                  className="w-full flex items-center justify-between px-4 py-3"
                >
                  <span className="text-sm font-medium text-text-primary">{cat.category}</span>
                  {expandedCat === cat.category ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
                </button>
                <AnimatePresence>
                  {expandedCat === cat.category && (
                    <motion.div
                      initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                      className="overflow-hidden border-t border-white/6"
                    >
                      {cat.items.map((med) => (
                        <button key={med}
                          onClick={() => { setSelectedMedicine(med); setStep('details') }}
                          className={`w-full text-left px-4 py-2.5 text-sm transition-colors
                            ${selectedMedicine === med ? 'bg-crimson/10 text-crimson-light' : 'hover:bg-white/4 text-text-secondary hover:text-text-primary'}`}
                        >
                          {med}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </motion.div>
        )}

        {/* ── Step 2: Details ── */}
        {step === 'details' && (
          <motion.div key="details"
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            className="flex flex-col gap-4"
          >
            {/* Selected medicine */}
            <div className="flex items-center gap-3 p-4 rounded-lg bg-crimson/8 border border-crimson/20">
              <Package size={20} className="text-crimson-light flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-text-primary">{selectedMedicine}</p>
                <button onClick={() => setStep('select')} className="text-2xs text-crimson hover:text-crimson-light transition-colors">
                  Change medicine →
                </button>
              </div>
            </div>

            {/* Quantity */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Quantity</label>
              <div className="flex items-center gap-3">
                <button onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-9 h-9 rounded-lg bg-white/8 border border-white/12 text-text-primary flex items-center justify-center hover:bg-white/12 transition-colors text-lg font-bold">
                  −
                </button>
                <span className="font-mono-data font-black text-3xl text-text-primary w-12 text-center">{quantity}</span>
                <button onClick={() => setQuantity(Math.min(20, quantity + 1))}
                  className="w-9 h-9 rounded-lg bg-white/8 border border-white/12 text-text-primary flex items-center justify-center hover:bg-white/12 transition-colors text-lg font-bold">
                  +
                </button>
                <span className="text-sm text-text-secondary ml-1">units</span>
              </div>
            </div>

            {/* Priority */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Priority</label>
              <div className="flex flex-col gap-2">
                {PRIORITIES.map((p) => (
                  <button key={p.value} onClick={() => setPriority(p.value)}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${priority === p.value ? p.color + ' border-opacity-100' : 'border-white/8 bg-white/3 text-text-muted'}`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0
                      ${priority === p.value ? 'border-current' : 'border-white/20'}`}>
                      {priority === p.value && <div className="w-2 h-2 rounded-full bg-current" />}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold">{p.label}</p>
                      <p className="text-2xs opacity-70">{p.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Location (auto-filled) */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Delivery Location</label>
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate border border-white/10">
                <MapPin size={14} className="text-text-muted" />
                <span className="text-sm text-text-primary">PHC Chandaka</span>
                <span className="text-2xs text-text-muted ml-auto">Auto-filled</span>
              </div>
            </div>

            {/* Notes */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Patient details, clinical context..."
                rows={3}
                className="w-full px-4 py-2.5 rounded-lg bg-slate border border-white/10 text-text-primary text-sm resize-none outline-none focus:border-white/20 transition-all"
              />
            </div>

            {priority === 'emergency' && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-crimson/8 border border-crimson/20">
                <AlertTriangle size={14} className="text-crimson-light mt-0.5 flex-shrink-0" />
                <p className="text-xs text-crimson-light">
                  Emergency order. Drone will be dispatched with highest priority. Ensure receiver is available at destination.
                </p>
              </div>
            )}

            <button onClick={() => setStep('confirm')} className="btn-primary w-full mt-2">
              Review Order
              <ArrowRight size={15} />
            </button>
          </motion.div>
        )}

        {/* ── Step 3: Confirm ── */}
        {step === 'confirm' && (
          <motion.div key="confirm"
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            className="flex flex-col gap-4"
          >
            <div className="panel p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-px flex-1 bg-white/8" />
                <span className="text-2xs text-text-muted uppercase tracking-widest font-semibold">Order Summary</span>
                <div className="h-px flex-1 bg-white/8" />
              </div>

              {[
                { label: 'Medicine', value: selectedMedicine },
                { label: 'Quantity', value: `${quantity} units` },
                { label: 'Priority', value: priority.charAt(0).toUpperCase() + priority.slice(1) },
                { label: 'From', value: 'MediHawk Central Hub' },
                { label: 'To', value: 'PHC Chandaka' },
                { label: 'Est. Delivery', value: '11–14 minutes' },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between py-2 border-b border-white/6 last:border-0">
                  <span className="text-xs text-text-muted">{row.label}</span>
                  <span className={`text-xs font-semibold ${row.label === 'Priority' && priority === 'emergency' ? 'text-crimson-light' : 'text-text-primary'}`}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>

            {priority === 'emergency' && (
              <div className="flex items-center justify-center gap-2 py-3 rounded-lg bg-crimson/10 border border-crimson/30">
                <AlertTriangle size={16} className="text-crimson-light" />
                <span className="text-sm font-bold text-crimson-light tracking-wide">EMERGENCY PRIORITY CONFIRMED</span>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="btn-primary w-full"
              style={{ fontSize: '0.9rem', padding: '0.8rem' }}
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Submitting...
                </span>
              ) : (
                <>
                  <Package size={16} />
                  PLACE EMERGENCY ORDER
                </>
              )}
            </button>

            <button onClick={() => setStep('details')} className="btn-ghost w-full">
              ← Go back
            </button>
          </motion.div>
        )}

        {/* ── Step 4: Success ── */}
        {step === 'success' && (
          <motion.div key="success"
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-5 py-8 text-center"
          >
            <motion.div
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
              className="w-20 h-20 rounded-full bg-med-green/15 border-2 border-med-green flex items-center justify-center"
            >
              <CheckCircle size={36} className="text-med-green-light" />
            </motion.div>

            <div>
              <h2 className="text-2xl font-black text-text-primary">REQUEST RECEIVED</h2>
              <p className="text-sm text-text-secondary mt-2">Your order has been submitted to MediHawk Command Center.</p>
            </div>

            <div className="w-full panel p-5">
              <p className="text-2xs text-text-muted uppercase tracking-widest mb-1">Order ID</p>
              <p className="font-mono-data font-bold text-xl text-crimson-light">{orderId}</p>
              <div className="h-px bg-white/8 my-3" />
              {[
                { label: 'Status', value: 'AWAITING MISSION APPROVAL' },
                { label: 'Medicine', value: selectedMedicine },
                { label: 'Quantity', value: `${quantity} units` },
                { label: 'Destination', value: 'PHC Chandaka' },
                { label: 'Priority', value: priority.toUpperCase() },
              ].map((r) => (
                <div key={r.label} className="flex justify-between py-1.5 text-xs">
                  <span className="text-text-muted">{r.label}</span>
                  <span className={`font-semibold ${r.label === 'Priority' && priority === 'emergency' ? 'text-crimson-light' : r.label === 'Status' ? 'text-amber-light' : 'text-text-primary'}`}>
                    {r.value}
                  </span>
                </div>
              ))}
            </div>

            <button onClick={() => navigate('/doctor/track')} className="btn-primary w-full">
              <NavIcon size={15} />
              Track Request
            </button>
            <button onClick={() => { setStep('select'); setSelectedMedicine(''); setQuantity(1); setNotes('') }}
              className="btn-ghost">
              New Order
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
