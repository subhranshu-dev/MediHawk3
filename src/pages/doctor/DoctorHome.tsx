import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Package, Navigation, CheckCircle, Clock, MapPin, Wifi } from 'lucide-react'
import { useStore } from '@/store'
import { orderStatusBadge, priorityBadge } from '@/components/ui/StatusBadge'
import { format } from 'date-fns'

export function DoctorHome() {
  const { user, orders, drones, systemStatus, activeMission } = useStore()
  const navigate = useNavigate()

  const myOrders = orders.filter((o) => o.doctor_id === user?.id)
  const activeOrder = myOrders.find((o) => ['in_flight', 'launched', 'preparing', 'approved'].includes(o.status))
  const latestOrder = myOrders[0]
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const activeDrones = drones.filter((d) => d.status !== 'offline' && d.status !== 'maintenance').length

  return (
    <div className="flex flex-col gap-5">
      {/* Greeting */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-text-secondary text-sm">{greeting},</p>
        <h1 className="text-2xl font-bold text-text-primary mt-0.5">{user?.name}</h1>
        <div className="flex items-center gap-2 mt-1">
          <MapPin size={13} className="text-text-muted" />
          <span className="text-xs text-text-secondary">PHC Chandaka · Khordha District</span>
        </div>
      </motion.div>

      {/* Operational status */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="panel p-4 flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full rounded-full bg-med-green-light opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-med-green" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">Network Operational</p>
            <p className="text-2xs text-text-muted">{activeDrones} drones active · 4G link stable</p>
          </div>
        </div>
        <Wifi size={18} className="text-med-green-light" />
      </motion.div>

      {/* Active delivery banner */}
      {activeOrder && activeMission && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15 }}
          onClick={() => navigate('/doctor/track')}
          className="relative overflow-hidden rounded-lg border border-crimson/30 bg-gradient-to-r from-crimson/10 to-transparent cursor-pointer group"
        >
          <div className="absolute inset-0 bg-crimson/5 group-hover:bg-crimson/8 transition-colors" />
          <div className="relative p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xs text-crimson font-bold tracking-widest uppercase">Active Delivery</span>
              {priorityBadge(activeOrder.priority)}
            </div>
            <h3 className="text-base font-bold text-text-primary">{activeOrder.medicine}</h3>
            <p className="text-xs text-text-secondary mt-0.5">{activeOrder.quantity} {activeOrder.unit} · {activeOrder.destination_name}</p>

            <div className="flex items-center gap-4 mt-3">
              <div>
                <div className="text-2xs text-text-muted">ETA</div>
                <div className="font-mono-data font-bold text-med-green-light">{activeMission.eta_minutes} min</div>
              </div>
              <div>
                <div className="text-2xs text-text-muted">Altitude</div>
                <div className="font-mono-data font-bold text-text-primary">
                  {drones.find(d => d.mission_id)?.altitude ?? 82} m
                </div>
              </div>
              <div>
                <div className="text-2xs text-text-muted">Status</div>
                <div>{orderStatusBadge(activeOrder.status)}</div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 mt-3 text-xs text-crimson-light">
              <Navigation size={13} />
              <span>Tap to track live →</span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <motion.button
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          onClick={() => navigate('/doctor/order')}
          className="flex flex-col items-center gap-3 p-5 rounded-lg border border-crimson/20 bg-crimson/8 hover:bg-crimson/12 transition-colors"
        >
          <div className="w-12 h-12 rounded-xl bg-crimson/15 border border-crimson/25 flex items-center justify-center">
            <Package size={22} className="text-crimson-light" />
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-text-primary">Request</p>
            <p className="text-2xs text-text-muted">Medicine Delivery</p>
          </div>
        </motion.button>

        <motion.button
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          onClick={() => navigate('/doctor/track')}
          className="flex flex-col items-center gap-3 p-5 rounded-lg border border-white/8 bg-white/3 hover:bg-white/5 transition-colors"
        >
          <div className="w-12 h-12 rounded-xl bg-white/8 border border-white/12 flex items-center justify-center">
            <Navigation size={22} className="text-text-secondary" />
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-text-primary">Track</p>
            <p className="text-2xs text-text-muted">Active Delivery</p>
          </div>
        </motion.button>
      </div>

      {/* Recent order */}
      {latestOrder && (
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-3">
            Most Recent Order
          </h2>
          <div className="panel p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm font-semibold text-text-primary">{latestOrder.medicine}</p>
                <p className="text-xs text-text-secondary">{latestOrder.quantity} {latestOrder.unit}</p>
              </div>
              {orderStatusBadge(latestOrder.status)}
            </div>
            <div className="flex items-center gap-4 text-xs text-text-muted mt-2">
              <span className="flex items-center gap-1">
                <Clock size={11} />
                {format(new Date(latestOrder.ordered_at), 'MMM d, HH:mm')}
              </span>
              <span className="flex items-center gap-1">
                <MapPin size={11} />
                {latestOrder.destination_name}
              </span>
            </div>
            {latestOrder.delivery_time_minutes && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-med-green-light">
                <CheckCircle size={13} />
                Delivered in {latestOrder.delivery_time_minutes} min
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Orders summary */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <h2 className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-3">
          Your Orders
        </h2>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Total', value: myOrders.length, color: 'text-text-primary' },
            { label: 'Completed', value: myOrders.filter(o => o.status === 'verified').length, color: 'text-med-green-light' },
            { label: 'Active', value: myOrders.filter(o => ['in_flight','launched','pending','approved'].includes(o.status)).length, color: 'text-crimson-light' },
          ].map((stat) => (
            <div key={stat.label} className="panel p-3 text-center">
              <div className={`font-mono-data font-bold text-2xl ${stat.color}`}>{stat.value}</div>
              <div className="text-2xs text-text-muted mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
