import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Search, History, Download, Filter } from 'lucide-react'
import { useStore } from '@/store'
import { orderService } from '@/services/api'
import { orderStatusBadge, priorityBadge } from '@/components/ui/StatusBadge'
import { clsx } from 'clsx'
import { format } from 'date-fns'

export function AdminHistory() {
  const { orders, addOrder } = useStore()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [priority, setPriority] = useState('all')

  useEffect(() => {
    orderService.list().then(fetched => { fetched.forEach(o => addOrder(o)) }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = orders.filter((o) => {
    const matchStatus = status === 'all' || o.status === status
    const matchPriority = priority === 'all' || o.priority === priority
    const matchSearch = !search || (
      o.medicine.toLowerCase().includes(search.toLowerCase()) ||
      o.id.toLowerCase().includes(search.toLowerCase()) ||
      o.doctor_name.toLowerCase().includes(search.toLowerCase())
    )
    return matchStatus && matchPriority && matchSearch
  })

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <History size={18} className="text-text-secondary" />
            <div>
              <h1 className="text-lg font-bold text-text-primary">Order History</h1>
              <p className="text-xs text-text-secondary">{orders.length} total records</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search..." className="pl-8 pr-4 py-2 rounded bg-slate border border-white/10 text-text-primary text-xs outline-none focus:border-white/20 w-44" />
            </div>

            {/* Status filter */}
            <select value={status} onChange={e => setStatus(e.target.value)}
              className="px-3 py-2 rounded bg-slate border border-white/10 text-text-secondary text-xs outline-none focus:border-white/20">
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="in_flight">In Flight</option>
              <option value="delivered">Delivered</option>
              <option value="verified">Verified</option>
              <option value="cancelled">Cancelled</option>
            </select>

            {/* Priority filter */}
            <select value={priority} onChange={e => setPriority(e.target.value)}
              className="px-3 py-2 rounded bg-slate border border-white/10 text-text-secondary text-xs outline-none focus:border-white/20">
              <option value="all">All Priority</option>
              <option value="emergency">Emergency</option>
              <option value="urgent">Urgent</option>
              <option value="normal">Normal</option>
            </select>

            <button className="btn-ghost text-xs py-2">
              <Download size={13} />
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/8 sticky top-0 bg-graphite">
              {['Order ID', 'Doctor', 'Medicine', 'Qty', 'Destination', 'Drone', 'Priority', 'Status', 'Ordered', 'Delivered', 'Time'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-2xs text-text-muted font-semibold uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((order, i) => (
              <motion.tr
                key={order.id}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ delay: i * 0.025 }}
                className="border-b border-white/4 hover:bg-white/2 transition-colors"
              >
                <td className="px-4 py-3"><span className="font-mono-data text-xs text-text-primary">{order.id}</span></td>
                <td className="px-4 py-3"><span className="text-xs text-text-secondary">{order.doctor_name}</span></td>
                <td className="px-4 py-3"><span className="text-xs font-medium text-text-primary">{order.medicine}</span></td>
                <td className="px-4 py-3"><span className="font-mono-data text-xs text-text-primary">{order.quantity}</span></td>
                <td className="px-4 py-3"><span className="text-xs text-text-secondary">{order.destination_name}</span></td>
                <td className="px-4 py-3"><span className="font-mono-data text-2xs text-text-muted">{order.drone_id ?? '—'}</span></td>
                <td className="px-4 py-3">{priorityBadge(order.priority)}</td>
                <td className="px-4 py-3">{orderStatusBadge(order.status)}</td>
                <td className="px-4 py-3"><span className="font-mono-data text-2xs text-text-muted">{format(new Date(order.ordered_at), 'MMM d HH:mm')}</span></td>
                <td className="px-4 py-3">
                  <span className="font-mono-data text-2xs text-text-muted">
                    {order.delivered_at ? format(new Date(order.delivered_at), 'HH:mm') : '—'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono-data text-xs text-text-primary">
                    {order.delivery_time_minutes ? `${order.delivery_time_minutes} min` : '—'}
                  </span>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16">
            <Search size={32} className="text-text-muted" />
            <p className="text-sm text-text-secondary">No orders match your filters</p>
          </div>
        )}
      </div>
    </div>
  )
}
