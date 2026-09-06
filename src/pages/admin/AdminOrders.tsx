import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Package, ChevronDown, ChevronUp, CheckCircle2, XCircle, Eye } from 'lucide-react'
import { useStore } from '@/store'
import { useToast } from '@/components/ui/Toast'
import { orderStatusBadge, priorityBadge } from '@/components/ui/StatusBadge'
import { Modal } from '@/components/ui/Modal'
import { INSPECTION_CHECKS } from '@/data/mockData'
import type { Order, InspectionCheck } from '@/types'
import { format } from 'date-fns'
import { clsx } from 'clsx'

function InspectionModal({ order, onClose, onLaunch }: {
  order: Order; onClose: () => void; onLaunch: () => void
}) {
  const [checks, setChecks] = useState<InspectionCheck[]>(INSPECTION_CHECKS)
  const allPass = checks.every((c) => c.status === 'pass' || !c.mandatory)
  const hasBlocked = checks.some((c) => c.status === 'blocked')

  return (
    <div className="flex flex-col gap-5">
      {/* Readiness indicator */}
      <div className={clsx(
        'flex items-center justify-center gap-3 py-4 rounded-lg border',
        hasBlocked ? 'bg-crimson/8 border-crimson/30' : allPass ? 'bg-med-green/8 border-med-green/30' : 'bg-amber/8 border-amber/30'
      )}>
        {hasBlocked
          ? <XCircle size={24} className="text-crimson-light" />
          : allPass
          ? <CheckCircle2 size={24} className="text-med-green-light" />
          : <span className="text-amber-light text-2xl">⚠</span>
        }
        <div>
          <p className={clsx(
            'font-bold text-base tracking-wide',
            hasBlocked ? 'text-crimson-light' : allPass ? 'text-med-green-light' : 'text-amber-light'
          )}>
            {hasBlocked ? 'LAUNCH BLOCKED' : allPass ? 'MISSION READY' : 'CHECKS PENDING'}
          </p>
          <p className="text-2xs text-text-muted">
            {hasBlocked ? 'Resolve all blocked checks before launch' : allPass ? 'All mandatory checks passed' : 'Some checks need attention'}
          </p>
        </div>
      </div>

      {/* Mission info */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        {[
          { label: 'Order ID', value: order.id },
          { label: 'Medicine', value: order.medicine },
          { label: 'Quantity', value: `${order.quantity} ${order.unit}` },
          { label: 'Destination', value: order.destination_name },
          { label: 'Priority', value: order.priority.toUpperCase() },
          { label: 'Drone', value: 'MH-D02 (Hawk Beta)' },
        ].map((r) => (
          <div key={r.label}>
            <p className="telemetry-label">{r.label}</p>
            <p className="text-text-primary font-medium">{r.value}</p>
          </div>
        ))}
      </div>

      {/* Checks list */}
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">Pre-Flight Checks</p>
        {checks.map((check) => (
          <div key={check.id} className={clsx(
            'flex items-center gap-3 px-3 py-2.5 rounded border',
            check.status === 'pass' ? 'bg-med-green/5 border-med-green/15' :
            check.status === 'blocked' ? 'bg-crimson/8 border-crimson/25' :
            check.status === 'warning' ? 'bg-amber/8 border-amber/25' :
            'bg-white/3 border-white/8'
          )}>
            <div className={clsx(
              'w-6 h-6 rounded flex items-center justify-center text-xs font-bold flex-shrink-0',
              check.status === 'pass' ? 'bg-med-green/20 text-med-green-light' :
              check.status === 'blocked' ? 'bg-crimson/20 text-crimson-light' :
              check.status === 'warning' ? 'bg-amber/20 text-amber-light' :
              'bg-white/8 text-text-muted'
            )}>
              {check.status === 'pass' ? '✓' : check.status === 'blocked' ? '✕' : check.status === 'warning' ? '!' : '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-text-primary">{check.label}</p>
              {check.detail && <p className="text-2xs text-text-muted">{check.detail}</p>}
            </div>
            <span className={clsx(
              'text-2xs font-bold uppercase tracking-wide',
              check.status === 'pass' ? 'text-med-green' : check.status === 'blocked' ? 'text-crimson' : 'text-amber'
            )}>
              {check.status}
            </span>
            {!check.mandatory && <span className="text-2xs text-text-muted">optional</span>}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        {!hasBlocked && allPass && (
          <button onClick={onLaunch} className="btn-green flex-1">
            <CheckCircle2 size={15} />
            CONFIRM &amp; LAUNCH
          </button>
        )}
        <button onClick={onClose} className="btn-danger flex-1">
          <XCircle size={15} />
          Cancel Mission
        </button>
      </div>
    </div>
  )
}

export function AdminOrders() {
  const { orders, updateOrderStatus } = useStore()
  const { toast } = useToast()
  const [filter, setFilter] = useState<'all' | 'pending' | 'active' | 'completed'>('all')
  const [search, setSearch] = useState('')
  const [inspecting, setInspecting] = useState<Order | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const filtered = orders.filter((o) => {
    const matchFilter = filter === 'all' ? true
      : filter === 'pending' ? o.status === 'pending'
      : filter === 'active' ? ['approved', 'preparing', 'launched', 'in_flight'].includes(o.status)
      : ['delivered', 'verified'].includes(o.status)
    const matchSearch = search
      ? o.medicine.toLowerCase().includes(search.toLowerCase()) || o.id.toLowerCase().includes(search.toLowerCase())
      : true
    return matchFilter && matchSearch
  })

  const handleLaunch = (order: Order) => {
    updateOrderStatus(order.id, 'launched')
    setInspecting(null)
    toast('success', `Mission launched: ${order.id}`, `${order.medicine} en route to ${order.destination_name}`)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-text-primary">Orders</h1>
          <p className="text-xs text-text-secondary">{orders.length} total · {orders.filter(o => o.status === 'pending').length} pending</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search orders..."
              className="pl-8 pr-4 py-2 rounded bg-slate border border-white/10 text-text-primary text-xs outline-none focus:border-white/20 w-48"
            />
          </div>
          {(['all', 'pending', 'active', 'completed'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={clsx('px-3 py-1.5 rounded text-xs font-semibold capitalize transition-all',
                filter === f ? 'bg-crimson text-white' : 'bg-white/8 text-text-secondary hover:bg-white/12')}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/6">
              {['Order ID', 'Medicine', 'Qty', 'Destination', 'Priority', 'Status', 'Ordered', 'Actions'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-2xs text-text-muted font-semibold uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((order, i) => (
              <>
                <motion.tr
                  key={order.id}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
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
                    <span className="font-mono-data text-xs text-text-primary">{order.quantity} {order.unit}</span>
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
                        <button onClick={() => setInspecting(order)} className="btn-primary text-xs py-1 px-2">
                          INSPECT
                        </button>
                      )}
                      <button onClick={() => setExpanded(expanded === order.id ? null : order.id)}
                        className="btn-ghost py-1 px-2">
                        <Eye size={12} />
                      </button>
                    </div>
                  </td>
                </motion.tr>

                {/* Expanded detail */}
                <AnimatePresence>
                  {expanded === order.id && (
                    <tr key={`${order.id}-detail`}>
                      <td colSpan={8} className="px-4 py-0">
                        <motion.div
                          initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="py-3 grid grid-cols-4 gap-4 bg-white/2 rounded my-1 px-4 text-xs">
                            <div><p className="telemetry-label">Doctor</p><p className="text-text-primary">{order.doctor_name}</p></div>
                            <div><p className="telemetry-label">Drone</p><p className="text-text-primary">{order.drone_id ?? '—'}</p></div>
                            <div><p className="telemetry-label">Delivered</p><p className="text-text-primary">
                              {order.delivered_at ? format(new Date(order.delivered_at), 'HH:mm:ss') : '—'}
                            </p></div>
                            <div><p className="telemetry-label">Delivery Time</p><p className="text-text-primary">
                              {order.delivery_time_minutes ? `${order.delivery_time_minutes} min` : '—'}
                            </p></div>
                            {order.notes && (
                              <div className="col-span-4"><p className="telemetry-label">Notes</p><p className="text-text-secondary">{order.notes}</p></div>
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
        size="lg"
      >
        {inspecting && (
          <InspectionModal
            order={inspecting}
            onClose={() => setInspecting(null)}
            onLaunch={() => handleLaunch(inspecting)}
          />
        )}
      </Modal>
    </div>
  )
}
