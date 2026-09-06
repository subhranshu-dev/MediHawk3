import {
  AreaChart, Area, XAxis, YAxis, ReferenceLine,
  ResponsiveContainer, Tooltip, CartesianGrid
} from 'recharts'
import { useStore } from '@/store'
import { format } from 'date-fns'
import { clsx } from 'clsx'

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const temp = payload[0].value
  const isSafe = temp >= 2 && temp <= 8
  return (
    <div className="panel px-3 py-2 text-xs border border-white/10">
      <p className="text-text-muted">{label}</p>
      <p className={clsx('font-mono-data font-bold text-sm mt-0.5', isSafe ? 'text-med-green-light' : 'text-crimson-light')}>
        {temp.toFixed(1)}°C
      </p>
      <p className={clsx('text-2xs', isSafe ? 'text-med-green' : 'text-crimson')}>
        {isSafe ? 'Within safe range' : 'OUTSIDE RANGE'}
      </p>
    </div>
  )
}

interface TemperatureChartProps {
  height?: number
  safeMin?: number
  safeMax?: number
}

export function TemperatureChart({ height = 160, safeMin = 2, safeMax = 8 }: TemperatureChartProps) {
  const { temperatureLogs } = useStore()

  const data = temperatureLogs.map((log) => ({
    time: format(new Date(log.timestamp), 'HH:mm'),
    temp: log.temperature,
  }))

  const lastTemp = data[data.length - 1]?.temp ?? 5.8
  const isSafe = lastTemp >= safeMin && lastTemp <= safeMax
  const strokeColor = isSafe ? '#16A34A' : '#DC2626'
  const fillId = isSafe ? 'tempGradSafe' : 'tempGradDanger'

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
        <defs>
          <linearGradient id="tempGradSafe" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#16A34A" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#16A34A" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="tempGradDanger" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#DC2626" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#DC2626" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.04)" />
        <XAxis
          dataKey="time"
          tick={{ fill: '#4E5668', fontSize: 10, fontFamily: 'Space Mono' }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[0, 12]}
          tick={{ fill: '#4E5668', fontSize: 10, fontFamily: 'Space Mono' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} />

        {/* Safe zone references */}
        <ReferenceLine y={safeMin} stroke="rgba(22,163,74,0.4)" strokeDasharray="4 4" label={{ value: `${safeMin}°C`, fill: '#16A34A', fontSize: 9, dx: 4 }} />
        <ReferenceLine y={safeMax} stroke="rgba(22,163,74,0.4)" strokeDasharray="4 4" label={{ value: `${safeMax}°C`, fill: '#16A34A', fontSize: 9, dx: 4 }} />

        <Area
          type="monotone"
          dataKey="temp"
          stroke={strokeColor}
          strokeWidth={2}
          fill={`url(#${fillId})`}
          dot={false}
          activeDot={{ r: 4, fill: strokeColor, stroke: strokeColor }}
          animationDuration={400}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ─── Analytics bar chart ──────────────────────────────────────────────────────
import { BarChart, Bar, LineChart, Line } from 'recharts'
import { generateDailyMetrics } from '@/data/mockData'

export function DeliveryVolumeChart({ height = 200 }: { height?: number }) {
  const data = generateDailyMetrics(13)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#DC2626" stopOpacity={0.8} />
            <stop offset="100%" stopColor="#DC2626" stopOpacity={0.2} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.04)" />
        <XAxis
          dataKey="date"
          tickFormatter={(v) => v.slice(5)}
          tick={{ fill: '#4E5668', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#4E5668', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{ background: '#1E2230', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6 }}
          labelStyle={{ color: '#8892A8', fontSize: 11 }}
          itemStyle={{ color: '#EDF0F7', fontFamily: 'Space Mono', fontSize: 12 }}
        />
        <Bar dataKey="deliveries" fill="url(#barGrad)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function SuccessRateChart({ height = 200 }: { height?: number }) {
  const data = generateDailyMetrics(13)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.04)" />
        <XAxis
          dataKey="date"
          tickFormatter={(v) => v.slice(5)}
          tick={{ fill: '#4E5668', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[94, 100]}
          tick={{ fill: '#4E5668', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{ background: '#1E2230', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6 }}
          labelStyle={{ color: '#8892A8', fontSize: 11 }}
          itemStyle={{ color: '#22C55E', fontFamily: 'Space Mono', fontSize: 12 }}
        />
        <Line
          type="monotone"
          dataKey="success_rate"
          stroke="#16A34A"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
