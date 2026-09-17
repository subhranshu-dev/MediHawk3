import { useState } from 'react'
import { motion } from 'framer-motion'
import { Search, Filter, Clock, MapPin, Package } from 'lucide-react'
import { useStore } from '@/store'
import { orderStatusBadge, priorityBadge } from '@/components/ui/StatusBadge'
import { format } from 'date-fns'

type Filter = 'all' | 'completed' | 'cancelled' | 'emergency'

export function DoctorHistory() {
  const { orders, user } = useStore()
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  const myOrders = orders.filter((o) => o.doctor_id === user?.id)

  const filtered = myOrders.filter((o) => {
    const matchFilter = filter === 'all' ? true
      : filter === 'completed' ? ['delivered', 'verified'].includes(o.status)
      : filter === 'cancelled' ? o.status === 'cancelled'
      : o.priority === 'emergency'
    const matchSearch = search
      ? o.medicine.toLowerCase().includes(search.toLowerCase()) || o.id.toLowerCase().includes(search.toLowerCase())
      : true
    return matchFilter && matchSearch
  })

  const FILTERS: { value: Filter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'completed', label: 'Completed' },
    { value: 'emergency', label: 'Emergency' },
    { value: 'cancelled', label: 'Cancelled' },
  ]

  return (
    <div className="flex flex-col gap-4">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl font-bold text-text-primary">Order History</h1>
        <p className="text-xs text-text-secondary mt-0.5">{myOrders.length} total orders · {user?.phc_name ?? user?.phc ?? 'Your PHC'}</p>
      </motion.div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by medicine or order ID..."
          className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-slate border border-white/10 text-text-primary text-sm outline-none focus:border-white/20 transition-all"
        />
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all
              ${filter === f.value ? 'bg-crimson text-white' : 'bg-white/8 text-text-secondary hover:bg-white/12'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Orders list */}
      <div className="flex flex-col gap-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Package size={32} className="text-text-muted" />
            <p className="text-sm text-text-secondary">No orders found</p>
          </div>
        ) : (
          filtered.map((order, i) => (
            <motion.div
              key={order.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="panel p-4"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary truncate">{order.medicine}</p>
                  <p className="text-2xs font-mono-data text-text-muted mt-0.5">{order.id}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {orderStatusBadge(order.status)}
                  {priorityBadge(order.priority)}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted mt-2">
                <span className="flex items-center gap-1">
                  <Package size={11} />
                  {order.quantity} {order.unit}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin size={11} />
                  {order.destination_name}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={11} />
                  {format(new Date(order.ordered_at), 'MMM d, HH:mm')}
                </span>
              </div>

              {order.delivery_time_minutes && (
                <div className="mt-2 text-xs text-med-green-light font-medium">
                  Delivered in {order.delivery_time_minutes} min
                </div>
              )}
            </motion.div>
          ))
        )}
      </div>
    </div>
  )
}
