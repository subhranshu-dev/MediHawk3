import type React from 'react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Package, Navigation, CheckCircle, Clock, MapPin } from 'lucide-react'
import { useStore } from '@/store'
import { orderStatusBadge, priorityBadge } from '@/components/ui/StatusBadge'
import { orderService } from '@/services/api'
import { format } from 'date-fns'

// Shared card surface style — medical pearl with defined edge and depth
const CARD: React.CSSProperties = {
  background: 'rgba(248,250,249,0.96)',
  border: '1px solid rgba(50,70,78,0.12)',
  borderRadius: '10px',
  boxShadow: '0 2px 8px rgba(38,56,64,0.06), 0 8px 24px rgba(38,56,64,0.07)',
}

export function DoctorHome() {
  const { user, orders, drones, activeMission, addOrder } = useStore()
  const navigate = useNavigate()

  useEffect(() => {
    orderService.list()
      .then(fetched => { fetched.forEach(o => addOrder(o)) })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const myOrders = orders.filter((o) => o.doctor_id === user?.id)
  const activeOrder = myOrders.find((o) => ['in_flight', 'launched', 'preparing', 'approved'].includes(o.status))
  const latestOrder = myOrders[0]
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="flex flex-col gap-5">

      {/* Doctor identity */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-sm text-text-secondary">{greeting},</p>
        <h1 className="text-2xl font-bold text-text-primary mt-0.5">{user?.name}</h1>
        <div className="flex items-center gap-2 mt-1">
          <MapPin size={13} className="text-text-muted" />
          <span className="text-xs text-text-secondary">{user?.phc_name ?? user?.phc ?? 'Your PHC'}</span>
        </div>
      </motion.div>

      {/* Incoming Delivery */}
      {activeOrder && activeMission && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.18 }}
          onClick={() => navigate('/doctor/track')}
          className="relative overflow-hidden cursor-pointer group"
          style={{
            ...CARD,
            border: '1px solid rgba(198,40,50,0.22)',
            background: 'rgba(255,252,252,0.97)',
            boxShadow: '0 2px 8px rgba(198,40,50,0.06), 0 8px 28px rgba(38,56,64,0.08)',
          }}
          whileHover={{ y: -2, boxShadow: '0 4px 16px rgba(198,40,50,0.10), 0 12px 32px rgba(38,56,64,0.10)' }}
        >
          {/* Left arrival pulse bar */}
          <motion.div
            className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-[10px]"
            style={{ background: '#C62832' }}
            animate={{ opacity: [0.9, 0.35, 0.9] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          />

          <div className="relative p-4 pl-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span
                  className="text-[10px] font-bold tracking-[0.18em] uppercase"
                  style={{ color: '#C62832' }}
                >
                  Incoming Delivery
                </span>
                {/* tiny live pulse */}
                <span className="relative flex h-1.5 w-1.5">
                  <motion.span
                    className="absolute inline-flex h-full w-full rounded-full"
                    style={{ background: 'rgba(198,40,50,0.55)' }}
                    animate={{ scale: [1, 2, 1], opacity: [0.7, 0, 0.7] }}
                    transition={{ duration: 1.8, repeat: Infinity }}
                  />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: '#C62832' }} />
                </span>
              </div>
              {priorityBadge(activeOrder.priority)}
            </div>

            <h3 className="text-base font-bold text-text-primary">{activeOrder.medicine}</h3>
            <p className="text-xs mt-0.5" style={{ color: '#4A6070' }}>
              {activeOrder.quantity} {activeOrder.unit} · {activeOrder.destination_name}
            </p>

            <div className="flex items-center gap-5 mt-3">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-text-muted mb-0.5">ETA</div>
                <div className="font-mono-data font-bold text-sm" style={{ color: '#1A7E55' }}>
                  {activeMission.eta_minutes} min
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-text-muted mb-0.5">Altitude</div>
                <div className="font-mono-data font-bold text-sm text-text-primary">
                  {drones.find(d => d.mission_id)?.altitude ?? 82} m
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-text-muted mb-0.5">Status</div>
                <div>{orderStatusBadge(activeOrder.status)}</div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 mt-3 text-xs" style={{ color: '#C62832' }}>
              <Navigation size={12} />
              <span>Tap to track live →</span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Quick actions — Request / Track */}
      <div className="grid grid-cols-2 gap-3">
        {/* Request */}
        <motion.button
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          onClick={() => navigate('/doctor/order')}
          className="flex flex-col items-center gap-3 p-5 rounded-[10px] text-left"
          style={{
            background: 'rgba(255,250,250,0.97)',
            border: '1px solid rgba(198,40,50,0.18)',
            boxShadow: '0 2px 8px rgba(198,40,50,0.06), 0 6px 20px rgba(38,56,64,0.07)',
            transition: 'box-shadow 200ms ease, transform 200ms ease, border-color 200ms ease',
          }}
          whileHover={{
            y: -2,
            boxShadow: '0 4px 16px rgba(198,40,50,0.12), 0 10px 28px rgba(38,56,64,0.10)',
          }}
        >
          <motion.div
            className="w-11 h-11 rounded-xl flex items-center justify-center"
            style={{
              background: 'rgba(198,40,50,0.10)',
              border: '1px solid rgba(198,40,50,0.22)',
            }}
            whileHover={{ y: -1 }}
            transition={{ duration: 0.18 }}
          >
            <Package size={20} style={{ color: '#C62832' }} />
          </motion.div>
          <div className="text-center">
            <p className="text-sm font-bold text-text-primary">Request</p>
            <p className="text-[11px] text-text-muted mt-0.5">Medicine Delivery</p>
          </div>
        </motion.button>

        {/* Track */}
        <motion.button
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.23 }}
          onClick={() => navigate('/doctor/track')}
          className="flex flex-col items-center gap-3 p-5 rounded-[10px] text-left"
          style={{
            background: 'rgba(246,249,251,0.97)',
            border: '1px solid rgba(50,70,90,0.14)',
            boxShadow: '0 2px 8px rgba(38,56,64,0.05), 0 6px 20px rgba(38,56,64,0.07)',
            transition: 'box-shadow 200ms ease, transform 200ms ease, border-color 200ms ease',
          }}
          whileHover={{
            y: -2,
            boxShadow: '0 4px 16px rgba(38,56,64,0.10), 0 10px 28px rgba(38,56,64,0.10)',
          }}
        >
          <motion.div
            className="w-11 h-11 rounded-xl flex items-center justify-center"
            style={{
              background: 'rgba(50,70,90,0.08)',
              border: '1px solid rgba(50,70,90,0.18)',
            }}
            whileHover={{ y: -1 }}
            transition={{ duration: 0.18 }}
          >
            <Navigation size={20} style={{ color: '#3A5060' }} />
          </motion.div>
          <div className="text-center">
            <p className="text-sm font-bold text-text-primary">Track</p>
            <p className="text-[11px] text-text-muted mt-0.5">Active Delivery</p>
          </div>
        </motion.button>
      </div>

      {/* Most Recent Order */}
      {latestOrder && (
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28 }}
        >
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] mb-3" style={{ color: '#7A939E' }}>
            Most Recent Order
          </h2>
          <div className="p-4" style={CARD}>
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm font-semibold text-text-primary">{latestOrder.medicine}</p>
                <p className="text-xs mt-0.5" style={{ color: '#4A6070' }}>
                  {latestOrder.quantity} {latestOrder.unit}
                </p>
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
              <div className="flex items-center gap-1.5 mt-2 text-xs" style={{ color: '#1A7E55' }}>
                <CheckCircle size={12} />
                Delivered in {latestOrder.delivery_time_minutes} min
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Your Orders */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.33 }}
      >
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] mb-3" style={{ color: '#7A939E' }}>
          Your Orders
        </h2>
        <div className="grid grid-cols-3 gap-2">
          {[
            {
              label: 'Total',
              value: myOrders.length,
              valueColor: '#263840',
              bg: 'rgba(248,250,249,0.96)',
              border: 'rgba(50,70,78,0.12)',
            },
            {
              label: 'Completed',
              value: myOrders.filter(o => o.status === 'verified').length,
              valueColor: '#1A7E55',
              bg: 'rgba(246,252,249,0.96)',
              border: 'rgba(26,126,85,0.14)',
            },
            {
              label: 'Active',
              value: myOrders.filter(o => ['in_flight','launched','pending','approved'].includes(o.status)).length,
              valueColor: '#C62832',
              bg: 'rgba(255,250,250,0.96)',
              border: 'rgba(198,40,50,0.14)',
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="p-3 text-center rounded-[10px]"
              style={{
                background: stat.bg,
                border: `1px solid ${stat.border}`,
                boxShadow: '0 2px 8px rgba(38,56,64,0.06)',
              }}
            >
              <div className="font-mono-data font-bold text-2xl" style={{ color: stat.valueColor }}>
                {stat.value}
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: '#7A939E' }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </motion.div>

    </div>
  )
}
