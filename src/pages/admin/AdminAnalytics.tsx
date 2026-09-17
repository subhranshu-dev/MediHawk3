import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { BarChart3, TrendingUp, Clock, ShieldCheck, Thermometer } from 'lucide-react'
import { DeliveryVolumeChart, SuccessRateChart } from '@/components/charts/TemperatureChart'
import { BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, Tooltip, CartesianGrid, XAxis, YAxis } from 'recharts'
import { generateDailyMetrics } from '@/data/mockData'
import { adminService } from '@/services/api'

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
  const [analyticsData, setAnalyticsData] = useState<Record<string, unknown> | null>(null)
  useEffect(() => {
    adminService.analytics().then((r) => setAnalyticsData(r as Record<string, unknown>)).catch(() => {})
  }, [])

  const orderStats = (analyticsData?.order_stats ?? {}) as Record<string, unknown>
  const fleetData = (analyticsData?.fleet ?? {}) as Record<string, unknown>
  const priorityStats = (orderStats?.priority ?? {}) as Record<string, number>
  const priorityData = [
    { name: 'Emergency', value: priorityStats.emergency ?? 0, color: '#C62832' },
    { name: 'Urgent', value: priorityStats.urgent ?? 0, color: '#D98B24' },
    { name: 'Normal', value: priorityStats.normal ?? 0, color: '#486A7A' },
  ]
  const fleetDrones = (fleetData?.drones ?? []) as Array<{ id: string; name: string; total_missions: number; flight_hours: number }>

  const metrics = generateDailyMetrics(30)
  const totalDeliveries = (orderStats?.delivered as number) ?? metrics.reduce((s, m) => s + m.deliveries, 0)
  const avgTime = (orderStats?.avg_delivery_minutes as number) ?? (metrics.reduce((s, m) => s + m.avg_time, 0) / metrics.length)
  const avgSuccess = metrics.reduce((s, m) => s + m.success_rate, 0) / metrics.length

  return (
    <div className="p-5 flex flex-col gap-5 overflow-auto">
      <div>
        <h1 className="text-lg font-bold text-text-primary">Operational Analytics</h1>
        <p className="text-xs text-text-secondary mt-0.5">MediHawk Network · Last 30 days</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Total Deliveries" value={totalDeliveries} icon={BarChart3} />
        <MetricCard label="Avg Delivery Time" value={typeof avgTime === 'number' ? avgTime.toFixed(1) : avgTime} unit="min" icon={Clock} color="text-med-green-light" />
        <MetricCard label="Mission Success Rate" value={`${typeof avgSuccess === 'number' ? avgSuccess.toFixed(1) : avgSuccess}%`} icon={ShieldCheck} color="text-med-green-light" />
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
                  <stop offset="0%" stopColor="#1F9D68" stopOpacity={0.8} />
                  <stop offset="100%" stopColor="#1F9D68" stopOpacity={0.2} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" stroke="rgba(67,88,99,0.12)" />
              <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} tick={{ fill: '#4A6070', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#4A6070', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: 'rgba(243,247,249,0.97)', border: '1px solid rgba(67,88,99,0.18)', borderRadius: 6, boxShadow: '0 8px 24px rgba(45,65,75,0.12)' }}
                itemStyle={{ color: '#17232B', fontFamily: 'Space Mono', fontSize: 11 }}
                labelStyle={{ color: '#4A6070', fontSize: 10 }}
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
                <Pie data={priorityData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                  {priorityData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'rgba(243,247,249,0.97)', border: '1px solid rgba(67,88,99,0.18)', borderRadius: 6, boxShadow: '0 8px 24px rgba(45,65,75,0.12)' }}
                  itemStyle={{ color: '#17232B', fontSize: 11 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-3">
              {priorityData.map((d) => (
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
          {fleetDrones.map((d) => {
            const maxMissions = Math.max(...fleetDrones.map(x => x.total_missions), 1)
            const util = Math.round((d.total_missions / maxMissions) * 100)
            return (
              <div key={d.id} className="flex flex-col gap-2">
                <p className="text-xs font-medium text-text-primary">{d.name}</p>
                <div className="text-xs text-text-muted">{d.total_missions} missions · {Math.round(d.flight_hours)}h</div>
                <div className="relative h-1.5 rounded bg-white/10 overflow-hidden">
                  <div className="absolute inset-y-0 left-0 rounded bg-crimson" style={{ width: `${util}%` }} />
                </div>
                <span className="font-mono-data text-2xs text-text-muted">{util}% utilized</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
