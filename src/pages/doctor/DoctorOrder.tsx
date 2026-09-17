import type React from 'react'
import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Package, ChevronDown, ChevronUp, AlertTriangle,
  ArrowLeft, ArrowRight, CheckCircle, MapPin,
  Navigation as NavIcon, Syringe, FlaskConical,
  Droplets, Zap, Plus, Search, X, Check, Activity,
  TestTube, Baby, PillBottle,
} from 'lucide-react'
import { useStore } from '@/store'
import { useToast } from '@/components/ui/Toast'
import { inventoryService, orderService, adaptBackendOrder } from '@/services/api'
import type { OrderPriority } from '@/types'

// ─── Catalog ─────────────────────────────────────────────────────────────────

type IconType = 'flask' | 'ampoule' | 'syringe' | 'pill' | 'blood' | 'activity'

interface CatalogItem {
  id: string           // backend medicine_id (e.g. 'inv-001')
  name: string
  category: string
  unit: string
  subtitle: string
  iconType: IconType
  bloodGroup?: string
  maxQty: number       // from backend quantity
  stockStatus: 'in_stock' | 'low_stock' | 'critical' | 'expiring' | 'out_of_stock'
}

// ─── Backend → CatalogItem mapping ───────────────────────────────────────────

function mapBackendCategory(cat: string): string {
  const c = cat.toLowerCase()
  if (c.includes('maternal')) return 'Maternal Health'
  if (c.includes('vaccine')) return 'Vaccines'
  if (c.includes('blood')) return 'Blood / Supply'
  if (c.includes('general')) return 'General Emergency'
  if (c.includes('emergency')) return 'Emergency Medicine'
  return 'Other'
}

function mapIconType(cat: string, name: string): IconType {
  const n = name.toLowerCase()
  const c = cat.toLowerCase()
  if (n.includes('vaccine') || n.includes('immunoglobulin')) return 'syringe'
  if (c.includes('maternal') || n.includes('sulfate') || n.includes('oxytocin')) return 'ampoule'
  if (c.includes('blood')) return 'blood'
  if (n.includes('antivenin') || n.includes('antivenom')) return 'flask'
  if (n.includes('lignocaine') || n.includes('adrenaline') || n.includes('atropine')) return 'ampoule'
  return 'flask'
}

const CATEGORIES = [
  { name: 'Emergency Medicine', Icon: Zap, color: '#C62832', bg: 'rgba(198,40,50,0.08)' },
  { name: 'Maternal Health', Icon: Baby, color: '#C4618A', bg: 'rgba(196,97,138,0.08)' },
  { name: 'Vaccines', Icon: Syringe, color: '#1A7E55', bg: 'rgba(26,126,85,0.08)' },
  { name: 'Blood / Supply', Icon: Droplets, color: '#B33030', bg: 'rgba(179,48,48,0.08)' },
  { name: 'General Emergency', Icon: Activity, color: '#C47010', bg: 'rgba(196,112,16,0.08)' },
  { name: 'Other', Icon: Plus, color: '#3A5060', bg: 'rgba(58,80,96,0.08)' },
]

const PRIORITIES: { value: OrderPriority; label: string; desc: string }[] = [
  { value: 'emergency', label: 'Emergency', desc: 'Life-threatening — highest priority' },
  { value: 'urgent', label: 'Urgent', desc: 'Time-sensitive — prioritized dispatch' },
  { value: 'normal', label: 'Normal', desc: 'Routine delivery — standard queue' },
]

// ─── Sub-components ───────────────────────────────────────────────────────────

function BloodBagSVG({ group }: { group: string }) {
  const isSmall = group.length <= 2
  return (
    <svg viewBox="0 0 44 52" fill="none" xmlns="http://www.w3.org/2000/svg" width="44" height="52">
      <rect x="10" y="15" width="24" height="28" rx="4" fill="rgba(255,235,235,0.9)" stroke="#C62832" strokeWidth="1.4" />
      <rect x="16" y="7" width="12" height="10" rx="2" fill="rgba(255,235,235,0.9)" stroke="#C62832" strokeWidth="1.2" />
      <circle cx="22" cy="5" r="2.5" fill="white" stroke="#C62832" strokeWidth="1.2" />
      <line x1="22" y1="43" x2="22" y2="50" stroke="#C62832" strokeWidth="1.4" strokeLinecap="round" />
      <text x="22" y="32" textAnchor="middle" fill="#C62832" fontSize={isSmall ? '9' : '8'} fontWeight="700" fontFamily="system-ui, sans-serif">{group}</text>
    </svg>
  )
}

function ItemIconBox({ iconType, color, bg }: { iconType: IconType; color: string; bg: string }) {
  const props = { size: 18, style: { color } }
  const icon =
    iconType === 'flask' ? <FlaskConical {...props} /> :
    iconType === 'ampoule' ? <TestTube {...props} /> :
    iconType === 'syringe' ? <Syringe {...props} /> :
    iconType === 'pill' ? <PillBottle {...props} /> :
    iconType === 'activity' ? <Activity {...props} /> :
    <Package {...props} />
  return (
    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ background: bg, border: `1px solid ${color}28` }}>
      {icon}
    </div>
  )
}

function StockBadge({ stockStatus }: { stockStatus?: string }) {
  if (!stockStatus || stockStatus === 'in_stock') return null
  const cfg =
    stockStatus === 'critical' ? { label: 'Critical stock', color: '#C62832', bg: 'rgba(198,40,50,0.08)' } :
    stockStatus === 'low_stock' ? { label: 'Low stock', color: '#C47010', bg: 'rgba(196,112,16,0.08)' } :
    stockStatus === 'expiring' ? { label: 'Expiring soon', color: '#C47010', bg: 'rgba(196,112,16,0.08)' } :
    stockStatus === 'out_of_stock' ? { label: 'Out of stock', color: '#C62832', bg: 'rgba(198,40,50,0.08)' } :
    null
  if (!cfg) return null
  return (
    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded tracking-wide"
      style={{ color: cfg.color, background: cfg.bg }}>
      {cfg.label}
    </span>
  )
}

function QtyControl({ qty, onDec, onInc, max }: { qty: number; onDec: () => void; onInc: () => void; max: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onDec() }}
        aria-label="Decrease quantity"
        className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold transition-colors"
        style={{ background: 'rgba(198,40,50,0.10)', color: '#C62832', border: '1px solid rgba(198,40,50,0.18)' }}
      >−</button>
      <span className="font-mono-data font-bold text-sm text-text-primary w-5 text-center">{qty}</span>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onInc() }}
        aria-label="Increase quantity"
        disabled={qty >= max}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold transition-colors disabled:opacity-40"
        style={{ background: 'rgba(198,40,50,0.10)', color: '#C62832', border: '1px solid rgba(198,40,50,0.18)' }}
      >+</button>
    </div>
  )
}

// ─── Cart type ────────────────────────────────────────────────────────────────

interface CartEntry {
  id: string
  name: string
  category: string
  unit: string
  qty: number
  custom?: boolean
  subtitle: string
  maxQty: number
}

type Step = 'select' | 'details' | 'confirm' | 'success'

// ─── Main component ───────────────────────────────────────────────────────────

export function DoctorOrder() {
  const [step, setStep] = useState<Step>('select')
  const [cart, setCart] = useState<Record<string, CartEntry>>({})
  const [expandedCat, setExpandedCat] = useState<string | null>('Emergency Medicine')
  const [otherSearch, setOtherSearch] = useState('')
  const [customItemName, setCustomItemName] = useState('')
  const [priority, setPriority] = useState<OrderPriority>('emergency')
  const [patientAge, setPatientAge] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [orderId, setOrderId] = useState('')
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [inventoryLoading, setInventoryLoading] = useState(true)
  const [submitError, setSubmitError] = useState('')

  const { user, addOrder } = useStore()
  const navigate = useNavigate()
  const { toast } = useToast()

  useEffect(() => {
    inventoryService.list()
      .then(items => {
        const built: CatalogItem[] = items.map(item => ({
          id: item.id,
          name: item.medicine,
          category: mapBackendCategory(item.category),
          unit: item.unit,
          subtitle: item.category,
          iconType: mapIconType(item.category, item.medicine),
          maxQty: item.quantity,
          stockStatus: (item.status ?? 'in_stock') as CatalogItem['stockStatus'],
        }))
        setCatalog(built)
      })
      .catch(() => {})
      .finally(() => setInventoryLoading(false))
  }, [])

  // Derived
  const cartEntries = useMemo(() => Object.values(cart), [cart])
  const totalItems = cartEntries.length
  const totalUnits = cartEntries.reduce((s, e) => s + e.qty, 0)

  // Cart ops
  const addItem = (item: CatalogItem) => {
    if (item.maxQty === 0) return
    setCart(prev => prev[item.id] ? prev : {
      ...prev,
      [item.id]: { id: item.id, name: item.name, category: item.category, unit: item.unit, qty: 1, subtitle: item.subtitle, maxQty: item.maxQty },
    })
  }

  const removeItem = (id: string) => setCart(prev => { const n = { ...prev }; delete n[id]; return n })

  const setQty = (id: string, delta: number) => setCart(prev => {
    const e = prev[id]
    if (!e) return prev
    const nq = Math.max(1, Math.min(e.maxQty, e.qty + delta))
    return { ...prev, [id]: { ...e, qty: nq } }
  })

  const addCustomItem = () => {
    const name = customItemName.trim()
    if (!name) return
    const id = `custom-${Date.now()}`
    setCart(prev => ({
      ...prev,
      [id]: { id, name, category: 'Other', unit: 'units', qty: 1, custom: true, subtitle: 'Custom item', maxQty: 50 },
    }))
    setCustomItemName('')
  }

  const selectedCountFor = (catName: string) => cartEntries.filter(e => e.category === catName).length

  const maxQtyFor = (item: CatalogItem) => item.maxQty

  // Submit — requires real GPS and live backend
  const handleSubmit = async () => {
    setSubmitting(true)
    setSubmitError('')

    const backendEntries = cartEntries.filter(e => !e.custom)
    if (backendEntries.length === 0) {
      setSubmitError('No catalogue items selected — custom items cannot be submitted directly. Please add a standard medicine.')
      setSubmitting(false)
      return
    }

    // Real GPS — no fallback, no mock coordinates
    let latitude: number
    let longitude: number
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        })
      })
      latitude = pos.coords.latitude
      longitude = pos.coords.longitude
    } catch (gpsErr) {
      const e = gpsErr as GeolocationPositionError
      setSubmitError(
        e.code === 1
          ? 'Location permission denied. Please allow location access in your browser settings to submit an order.'
          : 'Unable to determine your location. Ensure GPS / location services are enabled.'
      )
      setSubmitting(false)
      return
    }

    try {
      const ageNum = patientAge.trim() ? parseInt(patientAge.trim(), 10) : undefined
      const payload = {
        latitude,
        longitude,
        items: backendEntries.map(e => ({ medicine_id: e.id, quantity: e.qty })),
        priority,
        ...(ageNum && ageNum >= 1 && ageNum <= 120 ? { patient_age: ageNum } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      }
      const res = await orderService.create(payload) as Record<string, unknown>
      const raw = (res as { order?: Record<string, unknown> }).order ?? res
      const newOrder = adaptBackendOrder(raw)
      setOrderId(newOrder.id)
      addOrder(newOrder)
      setStep('success')
      toast('success', `Order ${newOrder.id} submitted`, 'Awaiting mission approval')
    } catch (apiErr) {
      const e = apiErr as { code?: string; message?: string }
      setSubmitError(e.message ?? 'Order submission failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const otherCatalogResults = useMemo(() => {
    const q = otherSearch.toLowerCase().trim()
    if (!q) return []
    return catalog.filter(i => i.name.toLowerCase().includes(q) || i.subtitle.toLowerCase().includes(q))
  }, [otherSearch, catalog])

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => step === 'select' ? navigate('/doctor') : setStep(step === 'details' ? 'select' : 'details')}
          className="btn-ghost p-1.5 pl-0"
          aria-label="Go back"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-text-primary">Request Medical Delivery</h1>
          <div className="flex items-center gap-1 mt-0.5">
            <MapPin size={11} style={{ color: '#7A939E' }} />
            <p className="text-xs" style={{ color: '#7A939E' }}>PHC/CHC Chandaka → MediHawk Hub</p>
          </div>
        </div>
      </div>

      {/* Step indicator */}
      {step !== 'success' && (
        <div className="flex items-center gap-2">
          {(['select', 'details', 'confirm'] as Step[]).map((s, i) => {
            const done = (step === 'confirm' && i < 2) || (step === 'details' && i < 1)
            const active = step === s
            return (
              <div key={s} className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    background: done ? '#1A7E55' : active ? '#C62832' : 'rgba(50,70,90,0.10)',
                    color: done || active ? 'white' : '#7A939E',
                  }}
                >
                  {done ? <Check size={12} /> : i + 1}
                </div>
                {i < 2 && (
                  <div className="w-8 h-px" style={{ background: done ? 'rgba(26,126,85,0.35)' : 'rgba(50,70,90,0.14)' }} />
                )}
              </div>
            )
          })}
          <span className="text-xs ml-1" style={{ color: '#7A939E' }}>
            {step === 'select' ? 'Select Medicine' : step === 'details' ? 'Order Details' : 'Confirm Order'}
          </span>
        </div>
      )}

      <AnimatePresence mode="wait">

        {/* ──────────────────── STEP 1: SELECT MEDICINE ──────────────────── */}
        {step === 'select' && (
          <motion.div key="select"
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.18 }}
            className={`flex flex-col gap-2 ${totalItems > 0 ? 'pb-28' : 'pb-2'}`}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.15em]" style={{ color: '#7A939E' }}>Select Medicine</p>

            {inventoryLoading && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-[10px]"
                style={{ background: 'rgba(240,245,248,0.90)', border: '1px solid rgba(50,70,78,0.12)' }}>
                <svg className="animate-spin w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-xs text-text-muted">Loading inventory from server…</span>
              </div>
            )}

            {CATEGORIES.map((cat) => {
              const isOpen = expandedCat === cat.name
              const count = selectedCountFor(cat.name)
              const catItems = cat.name !== 'Other' ? catalog.filter(i => i.category === cat.name) : []

              return (
                <div key={cat.name}
                  className="rounded-[10px] overflow-hidden"
                  style={{
                    background: 'rgba(248,250,249,0.96)',
                    border: `1px solid ${isOpen ? cat.color + '28' : 'rgba(50,70,78,0.12)'}`,
                    boxShadow: '0 2px 8px rgba(38,56,64,0.05)',
                    transition: 'border-color 200ms',
                  }}
                >
                  {/* Category row */}
                  <button
                    onClick={() => setExpandedCat(isOpen ? null : cat.name)}
                    className="w-full flex items-center gap-3 px-4 py-3"
                    aria-expanded={isOpen}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: cat.bg }}>
                      <cat.Icon size={15} style={{ color: cat.color }} />
                    </div>
                    <span className="text-sm font-semibold text-text-primary flex-1 text-left">{cat.name}</span>
                    {count > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full mr-2"
                        style={{ background: 'rgba(198,40,50,0.10)', color: '#C62832' }}>
                        {count} selected
                      </span>
                    )}
                    {isOpen
                      ? <ChevronUp size={14} style={{ color: '#7A939E' }} />
                      : <ChevronDown size={14} style={{ color: '#7A939E' }} />}
                  </button>

                  {/* Expanded items */}
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden border-t"
                        style={{ borderColor: 'rgba(50,70,78,0.08)' }}
                      >
                        {/* Other category: search + custom */}
                        {cat.name === 'Other' ? (
                          <div className="p-3 flex flex-col gap-3">
                            {/* Search */}
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                              style={{ background: 'rgba(240,245,248,0.9)', border: '1px solid rgba(50,70,78,0.12)' }}>
                              <Search size={14} style={{ color: '#7A939E' }} />
                              <input
                                type="text"
                                placeholder="Search medicine or medical supply..."
                                value={otherSearch}
                                onChange={e => setOtherSearch(e.target.value)}
                                className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                              />
                              {otherSearch && (
                                <button onClick={() => setOtherSearch('')} aria-label="Clear search">
                                  <X size={13} style={{ color: '#7A939E' }} />
                                </button>
                              )}
                            </div>

                            {/* Search results */}
                            {otherSearch.trim() && (
                              <div className="flex flex-col gap-1">
                                {otherCatalogResults.length > 0 ? (
                                  otherCatalogResults.map(item => {
                                    const sel = !!cart[item.id]
                                    const mq = maxQtyFor(item)
                                    return (
                                      <MedItemRow
                                        key={item.id}
                                        item={item}
                                        selected={sel}
                                        qty={cart[item.id]?.qty ?? 1}
                                        maxQty={mq}
                                        catColor={cat.color}
                                        catBg={cat.bg}
                                        onAdd={() => addItem(item)}
                                        onRemove={() => removeItem(item.id)}
                                        onDec={() => setQty(item.id, -1)}
                                        onInc={() => setQty(item.id, +1)}
                                      />
                                    )
                                  })
                                ) : (
                                  <p className="text-xs text-text-muted text-center py-2">
                                    No matching medical item found
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Custom item entry */}
                            <div className="flex flex-col gap-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#7A939E' }}>
                                Add custom item
                              </p>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  placeholder="Enter medicine / medical supply name"
                                  value={customItemName}
                                  onChange={e => setCustomItemName(e.target.value)}
                                  onKeyDown={e => e.key === 'Enter' && addCustomItem()}
                                  className="flex-1 px-3 py-2 rounded-lg text-sm text-text-primary outline-none"
                                  style={{
                                    background: 'rgba(240,245,248,0.9)',
                                    border: '1px solid rgba(50,70,78,0.12)',
                                  }}
                                />
                                <button
                                  onClick={addCustomItem}
                                  disabled={!customItemName.trim()}
                                  className="px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 transition-opacity"
                                  style={{ background: 'rgba(58,80,96,0.10)', color: '#3A5060', border: '1px solid rgba(58,80,96,0.18)' }}
                                >
                                  + Add
                                </button>
                              </div>
                            </div>

                            {/* Custom items in cart from Other */}
                            {cartEntries.filter(e => e.custom).length > 0 && (
                              <div className="flex flex-col gap-1.5">
                                <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#7A939E' }}>
                                  Custom items added
                                </p>
                                {cartEntries.filter(e => e.custom).map(e => (
                                  <div key={e.id}
                                    className="flex items-center justify-between px-3 py-2 rounded-lg"
                                    style={{ background: 'rgba(58,80,96,0.06)', border: '1px solid rgba(58,80,96,0.14)' }}>
                                    <div>
                                      <p className="text-xs font-semibold text-text-primary">{e.name}</p>
                                      <span className="text-[9px] font-bold uppercase tracking-wide"
                                        style={{ color: '#3A5060', background: 'rgba(58,80,96,0.10)', padding: '1px 5px', borderRadius: 4 }}>
                                        CUSTOM
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <QtyControl qty={e.qty} onDec={() => setQty(e.id, -1)} onInc={() => setQty(e.id, +1)} max={e.maxQty} />
                                      <button onClick={() => removeItem(e.id)} aria-label="Remove item"
                                        className="w-6 h-6 rounded-lg flex items-center justify-center"
                                        style={{ color: '#C62832', background: 'rgba(198,40,50,0.08)' }}>
                                        <X size={12} />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : cat.name === 'Blood / Supply' ? (
                          /* Blood items: 2-column grid */
                          <div className="p-3 grid grid-cols-2 gap-2">
                            {catItems.map(item => {
                              const sel = !!cart[item.id]
                              const mq = maxQtyFor(item)
                              return (
                                <BloodItemCard
                                  key={item.id}
                                  item={item}
                                  selected={sel}
                                  qty={cart[item.id]?.qty ?? 1}
                                  maxQty={mq}
                                  onAdd={() => addItem(item)}
                                  onRemove={() => removeItem(item.id)}
                                  onDec={() => setQty(item.id, -1)}
                                  onInc={() => setQty(item.id, +1)}
                                />
                              )
                            })}
                          </div>
                        ) : (
                          /* Standard items: full-width rows */
                          <div className="px-3 py-2 flex flex-col gap-1.5">
                            {catItems.map(item => {
                              const sel = !!cart[item.id]
                              const mq = maxQtyFor(item)
                              return (
                                <MedItemRow
                                  key={item.id}
                                  item={item}
                                  selected={sel}
                                  qty={cart[item.id]?.qty ?? 1}
                                  maxQty={mq}
                                  catColor={cat.color}
                                  catBg={cat.bg}
                                  onAdd={() => addItem(item)}
                                  onRemove={() => removeItem(item.id)}
                                  onDec={() => setQty(item.id, -1)}
                                  onInc={() => setQty(item.id, +1)}
                                />
                              )
                            })}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </motion.div>
        )}

        {/* ──────────────────── STEP 2: DETAILS ──────────────────── */}
        {step === 'details' && (
          <motion.div key="details"
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.18 }}
            className="flex flex-col gap-4"
          >
            {/* Selected items summary */}
            <div className="rounded-[10px] p-4"
              style={{ background: 'rgba(248,250,249,0.96)', border: '1px solid rgba(50,70,78,0.12)', boxShadow: '0 2px 8px rgba(38,56,64,0.06)' }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: '#7A939E' }}>
                  Selected — {totalItems} item{totalItems !== 1 ? 's' : ''} · {totalUnits} units
                </p>
                <button onClick={() => setStep('select')} className="text-xs font-medium" style={{ color: '#C62832' }}>
                  Edit
                </button>
              </div>
              <div className="flex flex-col gap-1.5">
                {cartEntries.map(e => (
                  <div key={e.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Check size={11} style={{ color: '#1A7E55' }} />
                      <span className="text-xs font-semibold text-text-primary">{e.name}</span>
                      {e.custom && (
                        <span className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: 'rgba(58,80,96,0.10)', color: '#3A5060' }}>CUSTOM</span>
                      )}
                    </div>
                    <span className="text-xs font-mono-data text-text-secondary">{e.qty} {e.unit}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Priority */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: '#7A939E' }}>Priority</label>
              <div className="flex flex-col gap-2">
                {PRIORITIES.map(p => {
                  const active = priority === p.value
                  const cfg =
                    p.value === 'emergency' ? { color: '#C62832', bg: 'rgba(198,40,50,0.06)', border: 'rgba(198,40,50,0.22)' } :
                    p.value === 'urgent' ? { color: '#C47010', bg: 'rgba(196,112,16,0.06)', border: 'rgba(196,112,16,0.22)' } :
                    { color: '#3A5060', bg: 'rgba(58,80,96,0.05)', border: 'rgba(58,80,96,0.18)' }
                  return (
                    <button key={p.value} onClick={() => setPriority(p.value)}
                      className="flex items-center gap-3 p-3 rounded-[10px] text-left transition-colors"
                      style={{
                        background: active ? cfg.bg : 'rgba(248,250,249,0.90)',
                        border: `1px solid ${active ? cfg.border : 'rgba(50,70,78,0.10)'}`,
                      }}>
                      <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                        style={{ borderColor: active ? cfg.color : 'rgba(50,70,78,0.25)' }}>
                        {active && <div className="w-2 h-2 rounded-full" style={{ background: cfg.color }} />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-text-primary">{p.label}</p>
                        <p className="text-xs text-text-muted">{p.desc}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Delivery location */}
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: '#7A939E' }}>Delivery Location</label>
              <div className="flex items-center gap-2 mt-2 px-4 py-2.5 rounded-[10px]"
                style={{ background: 'rgba(240,245,248,0.90)', border: '1px solid rgba(50,70,78,0.12)' }}>
                <MapPin size={14} style={{ color: '#7A939E' }} />
                <span className="text-sm text-text-primary flex-1">PHC Chandaka</span>
                <span className="text-[10px] text-text-muted">Auto-filled</span>
              </div>
            </div>

            {/* Patient Age */}
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: '#7A939E' }}>Patient Age (years)</label>
              <input
                type="number"
                min={1}
                max={120}
                value={patientAge}
                onChange={e => setPatientAge(e.target.value)}
                placeholder="e.g. 34"
                className="mt-2 w-full px-4 py-2.5 rounded-[10px] text-sm text-text-primary outline-none transition-colors"
                style={{
                  background: 'rgba(240,245,248,0.90)',
                  border: '1px solid rgba(50,70,78,0.12)',
                }}
              />
            </div>

            {/* Notes */}
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: '#7A939E' }}>Clinical Notes (optional)</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Patient details, clinical context..."
                rows={3}
                className="mt-2 w-full px-4 py-2.5 rounded-[10px] text-sm text-text-primary resize-none outline-none transition-colors"
                style={{
                  background: 'rgba(240,245,248,0.90)',
                  border: '1px solid rgba(50,70,78,0.12)',
                }}
              />
            </div>

            {priority === 'emergency' && (
              <div className="flex items-start gap-2 p-3 rounded-[10px]"
                style={{ background: 'rgba(198,40,50,0.06)', border: '1px solid rgba(198,40,50,0.18)' }}>
                <AlertTriangle size={14} style={{ color: '#C62832', flexShrink: 0, marginTop: 2 }} />
                <p className="text-xs" style={{ color: '#C62832' }}>
                  Emergency order — drone will be dispatched with highest priority. Ensure receiver is available at destination.
                </p>
              </div>
            )}

            <button onClick={() => setStep('confirm')} className="btn-primary w-full mt-1">
              Review Order <ArrowRight size={15} />
            </button>
          </motion.div>
        )}

        {/* ──────────────────── STEP 3: CONFIRM ──────────────────── */}
        {step === 'confirm' && (
          <motion.div key="confirm"
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.18 }}
            className="flex flex-col gap-4"
          >
            <div className="rounded-[10px] p-5"
              style={{ background: 'rgba(248,250,249,0.96)', border: '1px solid rgba(50,70,78,0.12)', boxShadow: '0 2px 8px rgba(38,56,64,0.06)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] mb-4" style={{ color: '#7A939E' }}>
                Order Summary
              </p>

              {/* Items list */}
              <div className="flex flex-col gap-2 mb-4">
                {cartEntries.map(e => (
                  <div key={e.id} className="flex items-center justify-between py-1.5 border-b"
                    style={{ borderColor: 'rgba(50,70,78,0.08)' }}>
                    <div className="flex items-center gap-2">
                      <CheckCircle size={13} style={{ color: '#1A7E55', flexShrink: 0 }} />
                      <div>
                        <p className="text-xs font-semibold text-text-primary">{e.name}</p>
                        <p className="text-[10px] text-text-muted">{e.category}{e.custom ? ' · CUSTOM' : ''}</p>
                      </div>
                    </div>
                    <span className="text-xs font-mono-data font-bold text-text-primary">{e.qty} {e.unit}</span>
                  </div>
                ))}
              </div>

              {/* Summary rows */}
              {[
                { label: 'Total items', value: `${totalItems} item${totalItems !== 1 ? 's' : ''}` },
                { label: 'Total units', value: `${totalUnits} units` },
                { label: 'Priority', value: priority.charAt(0).toUpperCase() + priority.slice(1) },
                { label: 'From', value: 'MediHawk Central Hub' },
                { label: 'To', value: 'PHC Chandaka' },
                { label: 'Est. Delivery', value: '11–14 minutes' },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between py-1.5 border-b last:border-0"
                  style={{ borderColor: 'rgba(50,70,78,0.08)' }}>
                  <span className="text-xs text-text-muted">{row.label}</span>
                  <span className={`text-xs font-semibold ${row.label === 'Priority' && priority === 'emergency' ? '' : 'text-text-primary'}`}
                    style={row.label === 'Priority' && priority === 'emergency' ? { color: '#C62832' } : undefined}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>

            {priority === 'emergency' && (
              <div className="flex items-center justify-center gap-2 py-3 rounded-[10px]"
                style={{ background: 'rgba(198,40,50,0.07)', border: '1px solid rgba(198,40,50,0.22)' }}>
                <AlertTriangle size={15} style={{ color: '#C62832' }} />
                <span className="text-sm font-bold tracking-wide" style={{ color: '#C62832' }}>EMERGENCY PRIORITY CONFIRMED</span>
              </div>
            )}

            {submitError && (
              <div className="flex items-start gap-2 p-3 rounded-[10px]"
                style={{ background: 'rgba(198,40,50,0.06)', border: '1px solid rgba(198,40,50,0.22)' }}>
                <AlertTriangle size={14} style={{ color: '#C62832', flexShrink: 0, marginTop: 2 }} />
                <p className="text-xs" style={{ color: '#C62832' }}>{submitError}</p>
              </div>
            )}

            <button type="submit" onClick={handleSubmit} disabled={submitting} className="btn-primary w-full"
              style={{ fontSize: '0.9rem', padding: '0.8rem' }}>
              {submitting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Submitting...
                </span>
              ) : (
                <><Package size={16} /> PLACE ORDER</>
              )}
            </button>

            <button type="button" onClick={() => setStep('details')} className="btn-ghost w-full">← Go back</button>
          </motion.div>
        )}

        {/* ──────────────────── STEP 4: SUCCESS ──────────────────── */}
        {step === 'success' && (
          <motion.div key="success"
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-5 py-8 text-center"
          >
            <motion.div
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(26,126,85,0.10)', border: '2px solid #1A7E55' }}
            >
              <CheckCircle size={36} style={{ color: '#1A7E55' }} />
            </motion.div>

            <div>
              <h2 className="text-2xl font-black text-text-primary">REQUEST RECEIVED</h2>
              <p className="text-sm text-text-secondary mt-2">Your order has been submitted to MediHawk Command Center.</p>
            </div>

            <div className="w-full rounded-[10px] p-5"
              style={{ background: 'rgba(248,250,249,0.96)', border: '1px solid rgba(50,70,78,0.12)', boxShadow: '0 2px 8px rgba(38,56,64,0.06)' }}>
              <p className="text-[10px] text-text-muted uppercase tracking-widest mb-1">Order ID</p>
              <p className="font-mono-data font-bold text-xl mb-3" style={{ color: '#C62832' }}>{orderId}</p>
              <div className="h-px mb-3" style={{ background: 'rgba(50,70,78,0.10)' }} />
              <div className="flex flex-col gap-1.5 text-left">
                {cartEntries.map(e => (
                  <div key={e.id} className="flex items-center justify-between text-xs">
                    <span className="text-text-secondary">{e.name}</span>
                    <span className="font-mono-data font-semibold text-text-primary">{e.qty} {e.unit}</span>
                  </div>
                ))}
                <div className="h-px my-1" style={{ background: 'rgba(50,70,78,0.08)' }} />
                <div className="flex justify-between text-xs">
                  <span className="text-text-muted">Priority</span>
                  <span className="font-semibold" style={{ color: priority === 'emergency' ? '#C62832' : '#3A5060' }}>
                    {priority.toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-text-muted">Status</span>
                  <span className="font-semibold" style={{ color: '#C47010' }}>AWAITING APPROVAL</span>
                </div>
              </div>
            </div>

            <button onClick={() => navigate('/doctor/track')} className="btn-primary w-full">
              <NavIcon size={15} /> Track Request
            </button>
            <button onClick={() => { setStep('select'); setCart({}); setNotes('') }} className="btn-ghost">
              New Order
            </button>
          </motion.div>
        )}

      </AnimatePresence>

      {/* ──────────────────── CART BAR (sticky above bottom nav) ──────────────────── */}
      {step === 'select' && (
        <div className="fixed bottom-[60px] inset-x-0 z-20 pointer-events-none">
          <div className="max-w-2xl mx-auto px-4">
            <AnimatePresence>
              {totalItems > 0 && (
                <motion.div
                  initial={{ y: 80, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 80, opacity: 0 }}
                  transition={{ duration: 0.22 }}
                  className="pointer-events-auto rounded-[12px] flex items-center justify-between gap-3 px-4 py-3"
                  style={{
                    background: 'rgba(248,250,249,0.98)',
                    border: '1px solid rgba(198,40,50,0.18)',
                    boxShadow: '0 4px 20px rgba(38,56,64,0.14), 0 1px 4px rgba(198,40,50,0.08)',
                  }}
                >
                  <div>
                    <p className="text-xs font-bold text-text-primary">
                      {totalItems} item{totalItems !== 1 ? 's' : ''} selected
                    </p>
                    <p className="text-[10px] text-text-muted">{totalUnits} units total</p>
                  </div>
                  <button
                    onClick={() => setStep('details')}
                    className="btn-primary text-sm px-4 py-2 whitespace-nowrap"
                  >
                    Proceed <ArrowRight size={14} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Item sub-components ──────────────────────────────────────────────────────

interface MedItemRowProps {
  item: CatalogItem
  selected: boolean
  qty: number
  maxQty: number
  catColor: string
  catBg: string
  onAdd: () => void
  onRemove: () => void
  onDec: () => void
  onInc: () => void
}

function MedItemRow({ item, selected, qty, maxQty, catColor, catBg, onAdd, onRemove, onDec, onInc }: MedItemRowProps) {
  return (
    <div
      className="rounded-[8px] overflow-hidden transition-colors"
      style={{
        background: selected ? `${catColor}08` : 'transparent',
        border: `1px solid ${selected ? catColor + '22' : 'transparent'}`,
        transition: 'background 180ms, border-color 180ms',
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => !selected && onAdd()}
        onKeyDown={e => { if (!selected && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onAdd() } }}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
        aria-pressed={selected}
      >
        <ItemIconBox iconType={item.iconType} color={selected ? catColor : '#8A9FA8'} bg={selected ? catBg : 'rgba(50,70,78,0.06)'} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-text-primary truncate">{item.name}</p>
            {selected && <Check size={13} style={{ color: '#1A7E55', flexShrink: 0 }} />}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-[11px] text-text-muted">{item.subtitle}</p>
            <StockBadge stockStatus={item.stockStatus} />
          </div>
        </div>
        {!selected && (
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(50,70,78,0.07)', border: '1px solid rgba(50,70,78,0.12)' }}>
            <Plus size={13} style={{ color: '#7A939E' }} />
          </div>
        )}
        {selected && (
          <div className="flex-shrink-0" onClick={e => e.stopPropagation()}>
            <QtyControl qty={qty} onDec={onDec} onInc={onInc} max={maxQty} />
          </div>
        )}
      </div>
    </div>
  )
}

interface BloodItemCardProps {
  item: CatalogItem
  selected: boolean
  qty: number
  maxQty: number
  onAdd: () => void
  onRemove: () => void
  onDec: () => void
  onInc: () => void
}

function BloodItemCard({ item, selected, qty, maxQty, onAdd, onDec, onInc }: BloodItemCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !selected && onAdd()}
      onKeyDown={e => { if (!selected && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onAdd() } }}
      className="flex flex-col items-center gap-2 p-3 rounded-[8px] transition-colors"
      style={{
        background: selected ? 'rgba(198,40,50,0.06)' : 'rgba(240,244,248,0.6)',
        border: `1px solid ${selected ? 'rgba(198,40,50,0.22)' : 'rgba(50,70,78,0.10)'}`,
        transition: 'background 180ms, border-color 180ms',
      }}
      aria-pressed={selected}
    >
      <div className="relative">
        <BloodBagSVG group={item.bloodGroup ?? ''} />
        {selected && (
          <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
            style={{ background: '#1A7E55', border: '1.5px solid white' }}>
            <Check size={9} style={{ color: 'white' }} />
          </div>
        )}
      </div>
      <p className="text-xs font-semibold text-text-primary text-center leading-tight">{item.name}</p>
      <StockBadge stockStatus={item.stockStatus} />
      {selected ? (
        <div onClick={e => e.stopPropagation()}>
          <QtyControl qty={qty} onDec={onDec} onInc={onInc} max={maxQty} />
        </div>
      ) : (
        <div className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: 'rgba(198,40,50,0.08)', border: '1px solid rgba(198,40,50,0.16)' }}>
          <Plus size={13} style={{ color: '#C62832' }} />
        </div>
      )}
    </div>
  )
}
