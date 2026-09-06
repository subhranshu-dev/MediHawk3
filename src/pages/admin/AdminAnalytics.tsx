import { motion } from 'framer-motion'
import { BarChart3, TrendingUp, Clock, ShieldCheck, Thermometer } from 'lucide-react'
import { DeliveryVolumeChart, SuccessRateChart } from '@/components/charts/TemperatureChart'
import { BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, Tooltip, CartesianGrid, XAxis, YAxis } from 'recharts'
import { generateDailyMetrics, ORDERS } from '@/data/mockData'

const PRIORITY_DATA = [
  { name: 'Emergency', value: ORDERS.filter(o => o.priority === 'emergency').length, color: '#DC2626' },
  { name: 'Urgent', value: ORDERS.filter(o => o.priority === 'urgent').length, color: '#D97706' },
  { name: 'Normal', value: ORDERS.filter(o => o.priority === 'normal').length, color: '#475569' },
]

const AVG_TIME_DATA = generateDailyMetrics(6)

function MetricCard({ label, value, unit, icon: Icon, trend, color = 'text-text-primary' }: any) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="panel p-5"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-lg bg-white/6 border border-white/10 flex items-center justify-center">
          <Icon size={18} className="text-text-secondary" />
        </div>
        {trend && (
          <span className="text-xs text-med-green-light font-semibold">↑ {trend}</span>
        )}
      </div>
      <p className={`font-mono-data font-black text-3xl ${color}`}>{value}{unit && <span className="text-lg text-text-secondary ml-1">{unit}</span>}</p>
      <p className="text-xs text-text-muted mt-1">{label}</p>
    </motion.div>
  )
}

export function AdminAnalytics() {
  const metrics = generateDailyMetrics(30)
  const totalDeliveries = metrics.reduce((s, m) => s + m.deliveries, 0)
  const avgTime = (metrics.reduce((s, m) => s + m.avg_time, 0) / metrics.length).toFixed(1)
  const avgSuccess = (metrics.reduce((s, m) => s + m.success_rate, 0) / metrics.length).toFixed(1)

  return (
    <div className="p-5 flex flex-col gap-5 overflow-auto">
      <div>
        <h1 className="text-lg font-bold text-text-primary">Operational Analytics</h1>
        <p className="text-xs text-text-secondary mt-0.5">MediHawk Network · Last 30 days</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Total Deliveries" value={totalDeliveries} icon={BarChart3} trend="12.4%" />
        <MetricCard label="Avg Delivery Time" value={avgTime} unit="min" icon={Clock} color="text-med-green-light" />
        <MetricCard label="Mission Success Rate" value={`${avgSuccess}%`} icon={ShieldCheck} color="text-med-green-light" />
        <MetricCard label="Cold-Chain Compliance" value="99.1%" icon={Thermometer} color="text-med-green-light" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="panel p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-1">Delivery Volume</h3>
          <p className="text-2xs text-text-muted mb-4">Daily deliveries over last 14 days</p>
          <DeliveryVolumeChart height={200} />
        </div>

        <div className="panel p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-1">Mission Success Rate</h3>
          <p className="text-2xs text-text-muted mb-4">% successful deliveries per day</p>
          <SuccessRateChart height={200} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Average delivery time */}
        <div className="panel p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-1">Avg Mission Duration</h3>
          <p className="text-2xs text-text-muted mb-4">Minutes per mission (last 7 days)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={AVG_TIME_DATA} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="timeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#16A34A" stopOpacity={0.8} />
                  <stop offset="100%" stopColor="#16A34A" stopOpacity={0.2} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} tick={{ fill: '#4E5668', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#4E5668', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#1E2230', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6 }}
                itemStyle={{ color: '#EDF0F7', fontFamily: 'Space Mono', fontSize: 11 }}
                labelStyle={{ color: '#8892A8', fontSize: 10 }}
              />
              <Bar dataKey="avg_time" fill="url(#timeGrad)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Priority distribution */}
        <div className="panel p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-1">Priority Distribution</h3>
          <p className="text-2xs text-text-muted mb-4">Orders by priority level</p>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width="50%" height={200}>
              <PieChart>
                <Pie data={PRIORITY_DATA} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                  {PRIORITY_DATA.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1E2230', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6 }}
                  itemStyle={{ color: '#EDF0F7', fontSize: 11 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-3">
              {PRIORITY_DATA.map((d) => (
                <div key={d.name} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: d.color }} />
                  <span className="text-xs text-text-secondary">{d.name}</span>
                  <span className="font-mono-data font-bold text-sm text-text-primary ml-auto">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Fleet utilization */}
      <div className="panel p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-4">Fleet Utilization</h3>
        <div className="grid grid-cols-4 gap-4">
          {[
            { drone: 'MH-D01 Hawk Alpha', missions: 187, hours: 312, util: 78 },
            { drone: 'MH-D02 Hawk Beta', missions: 143, hours: 241, util: 62 },
            { drone: 'MH-D03 Hawk Gamma', missions: 98, hours: 178, util: 45 },
            { drone: 'MH-D04 Hawk Delta', missions: 221, hours: 398, util: 32 },
          ].map((d) => (
            <div key={d.drone} className="flex flex-col gap-2">
              <p className="text-xs font-medium text-text-primary">{d.drone}</p>
              <div className="text-xs text-text-muted">{d.missions} missions · {d.hours}h</div>
              <div className="relative h-1.5 rounded bg-white/10 overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded bg-crimson"
                  style={{ width: `${d.util}%` }}
                />
              </div>
              <span className="font-mono-data text-2xs text-text-muted">{d.util}% utilized</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
