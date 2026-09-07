import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { useStore } from '@/store'

const SIM_PHASE_LABEL: Record<string, string> = {
  IDLE: 'STANDBY',
  PREPARING: 'PRE-FLIGHT',
  LAUNCHING: 'LAUNCH SEQ',
  ASCENDING: 'ASCENDING',
  CRUISE: 'CRUISE',
  WAYPOINT: 'WAYPOINT',
  APPROACHING: 'FINAL APPR',
  LANDING: 'LANDING',
  LANDED: 'LANDED',
  DELIVERY: 'DELIVERY',
  RTL: 'RTL',
  COMPLETED: 'COMPLETE',
}

const SIM_PHASE_COLOR: Record<string, string> = {
  IDLE: '#4E5668',
  PREPARING: '#D97706',
  LAUNCHING: '#F59E0B',
  ASCENDING: '#22C55E',
  CRUISE: '#16A34A',
  WAYPOINT: '#F59E0B',
  APPROACHING: '#D97706',
  LANDING: '#EF4444',
  LANDED: '#22C55E',
  DELIVERY: '#16A34A',
  RTL: '#8892A8',
  COMPLETED: '#4E5668',
}

function buildTickerMessages(
  droneAlt: number,
  droneSpd: number,
  droneBat: number,
  droneTemp: number,
  eta: number,
  phase: string,
  destination: string,
): string {
  const msgs = [
    `MH-D01 · ${SIM_PHASE_LABEL[phase] ?? phase} · ALT ${droneAlt}m · SPD ${droneSpd} km/h · ETA ${eta} MIN`,
    `COLD CHAIN: MAINTAINED · PAYLOAD ${droneTemp}°C · SAFE RANGE 2–8°C`,
    `ACTIVE MISSION: ${destination.toUpperCase()} · FLIGHT CORRIDOR NOMINAL`,
    `BATTERY: ${droneBat}% · GPS: LOCKED · HDOP 0.8 · 4G LINK: STABLE`,
    `AUTONOMOUS OBSTACLE AVOIDANCE: ACTIVE · GEOFENCE: ENABLED`,
    `SYSTEM HEALTH: ALL NOMINAL · ZEROTIER VPN: CONNECTED`,
  ]
  return msgs.join('     ·  ·  ·     ')
}

interface HealthDot {
  label: string
  ok: boolean
}

export function SystemBar() {
  const { drones, activeMission, systemStatus, simPhase, isDemo } = useStore()
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const flyingDrone = drones.find((d) => d.status === 'in_flight')

  const alt  = flyingDrone?.altitude.toFixed(0) ?? '—'
  const spd  = flyingDrone?.speed.toFixed(0) ?? '—'
  const bat  = flyingDrone?.battery.toFixed(0) ?? '—'
  const temp = flyingDrone?.temperature.toFixed(1) ?? '—'
  const eta  = activeMission?.eta_minutes ?? 0
  const dest = activeMission?.to_location ?? 'PHC CHANDAKA'

  const tickerText = buildTickerMessages(
    parseFloat(alt) || 0,
    parseFloat(spd) || 0,
    parseFloat(bat) || 0,
    parseFloat(temp) || 0,
    eta,
    simPhase,
    dest,
  )

  const health: HealthDot[] = [
    { label: 'GPS', ok: systemStatus.gps === 'locked' },
    { label: '4G',  ok: systemStatus.fourG === 'connected' },
    { label: 'NAV', ok: systemStatus.drone === 'online' },
    { label: 'VPN', ok: systemStatus.zerotier === 'connected' },
  ]

  const phaseColor = SIM_PHASE_COLOR[simPhase] ?? '#4E5668'
  const phaseLabel = SIM_PHASE_LABEL[simPhase] ?? simPhase

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex items-center h-9 px-3 gap-3"
      style={{
        background: 'rgba(8, 9, 12, 0.98)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* System health dots */}
      <div className="flex items-center gap-2.5 flex-shrink-0">
        {health.map((h) => (
          <div key={h.label} className="flex items-center gap-1">
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: h.ok ? '#16A34A' : '#DC2626',
                boxShadow: h.ok ? '0 0 4px rgba(22,163,74,0.6)' : '0 0 4px rgba(220,38,38,0.6)',
              }}
            />
            <span
              className="text-[9px] tracking-[0.12em] uppercase"
              style={{ fontFamily: 'Space Mono, monospace', color: h.ok ? '#4E5668' : '#EF4444' }}
            >
              {h.label}
            </span>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div className="w-px h-4 bg-white/8 flex-shrink-0" />

      {/* Phase indicator */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <div
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: phaseColor, boxShadow: `0 0 6px ${phaseColor}80` }}
        />
        <span
          className="text-[9px] tracking-[0.15em] uppercase font-bold"
          style={{ fontFamily: 'Space Mono, monospace', color: phaseColor }}
        >
          {phaseLabel}
        </span>
      </div>

      {/* Divider */}
      <div className="w-px h-4 bg-white/8 flex-shrink-0" />

      {/* Mission ticker */}
      <div className="flex-1 min-w-0 mission-ticker-wrap">
        <div className="mission-ticker-inner">
          <span
            className="text-[9px] tracking-[0.1em] text-[#4E5668]"
            style={{ fontFamily: 'Space Mono, monospace' }}
          >
            {tickerText}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{tickerText}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="w-px h-4 bg-white/8 flex-shrink-0" />

      {/* Mode badge */}
      {isDemo && (
        <div
          className="flex-shrink-0 px-2 py-0.5 rounded text-[9px] font-bold tracking-[0.15em] uppercase"
          style={{
            fontFamily: 'Space Mono, monospace',
            background: 'rgba(217,119,6,0.12)',
            border: '1px solid rgba(217,119,6,0.25)',
            color: '#F59E0B',
          }}
        >
          SIM
        </div>
      )}

      {/* Time */}
      <div className="flex-shrink-0">
        <span
          className="text-[10px] text-[#4E5668]"
          style={{ fontFamily: 'Space Mono, monospace' }}
        >
          {format(now, 'HH:mm:ss')}
        </span>
        <span
          className="text-[9px] ml-1"
          style={{ fontFamily: 'Space Mono, monospace', color: '#2C3045' }}
        >
          UTC
        </span>
      </div>
    </div>
  )
}
