// Hawkie Mission Intelligence Engine
// Pure deterministic functions — no React imports, no fabricated telemetry.
// All data comes from the HawkieContext derived from useStore().

import type { Order, Drone, Mission, Alert, SystemStatus, User } from '@/types'

export interface HawkieContext {
  user: User | null
  isDemo: boolean
  orders: Order[]
  drones: Drone[]
  activeMission: Mission | null
  alerts: Alert[]
  systemStatus: SystemStatus
}

export interface HawkieCard {
  type: 'mission' | 'drone' | 'order' | 'alert'
  title: string
  status: string
  metrics?: Array<{ label: string; value: string }>
}

export interface HawkieMessage {
  id: string
  role: 'user' | 'hawkie'
  text: string
  cards?: HawkieCard[]
  timestamp: Date
}

// ─── Intent detection ────────────────────────────────────────────────────────

type Intent =
  | 'SAFETY_COMMAND'
  | 'MEDICAL'
  | 'BATTERY'
  | 'GPS_DRONE'
  | 'TEMPERATURE'
  | 'ETA'
  | 'ALERTS'
  | 'LAUNCH_READY'
  | 'PENDING'
  | 'MISSION'
  | 'NETWORK'
  | 'FLEET'
  | 'HISTORY'
  | 'SITUATION'

function detectIntent(query: string): Intent {
  const q = query.toLowerCase()

  if (/\b(launch|arm|disarm|disable)\b/.test(q)) return 'SAFETY_COMMAND'
  if (/diagnos|treatment|dose|prescription/.test(q)) return 'MEDICAL'
  if (/battery|charge|power/.test(q)) return 'BATTERY'
  if (/gps|altitude|speed|position|where.*drone|drone.*where|location.*drone|drone.*location/.test(q)) return 'GPS_DRONE'
  if (/drone/.test(q) && !/fleet|all.*drone/.test(q)) return 'GPS_DRONE'
  if (/temperature|temp|cold chain/.test(q)) return 'TEMPERATURE'
  if (/eta|when.*arriv|how long|time.*arriv|arriv.*time/.test(q)) return 'ETA'
  if (/alert|warning|critical|issue/.test(q)) return 'ALERTS'
  if (/pre.*flight|ready.*launch|can.*launch|blocked/.test(q)) return 'LAUNCH_READY'
  if (/pending|need.*attention|review/.test(q)) return 'PENDING'
  if (/mission|flight|flying|in.?flight/.test(q)) return 'MISSION'
  if (/network|4g|connection|link/.test(q)) return 'NETWORK'
  if (/fleet|all.*drone/.test(q)) return 'FLEET'
  if (/history|previous|past|completed/.test(q)) return 'HISTORY'

  return 'SITUATION'
}

// ─── Response builders ────────────────────────────────────────────────────────

function demoSuffix(isDemo: boolean) {
  return isDemo ? '\n\n_(Simulation data)_' : ''
}

function activeMissionsFromOrders(orders: Order[]) {
  return orders.filter((o) => ['launched', 'in_flight', 'landing'].includes(o.status))
}

function buildMissionCards(activeMission: Mission | null, drones: Drone[]): HawkieCard[] {
  if (!activeMission) return []
  const drone = drones.find((d) => d.id === activeMission.drone_id)
  return [
    {
      type: 'mission',
      title: `Mission ${activeMission.id}`,
      status: activeMission.status,
      metrics: [
        { label: 'Medicine', value: `${activeMission.medicine} × ${activeMission.quantity}` },
        { label: 'Route', value: `${activeMission.from_location} → ${activeMission.to_location}` },
        { label: 'ETA', value: `${Math.max(0, activeMission.eta_minutes - activeMission.elapsed_minutes)} min` },
        ...(drone ? [{ label: 'Battery', value: `${drone.battery}%` }] : []),
      ],
    },
  ]
}

function buildDroneCard(drone: Drone): HawkieCard {
  return {
    type: 'drone',
    title: drone.name,
    status: drone.status,
    metrics: [
      { label: 'Battery', value: `${drone.battery}%` },
      { label: 'Altitude', value: `${drone.altitude} m` },
      { label: 'Speed', value: `${drone.speed} m/s` },
      { label: 'GPS', value: drone.gps_accuracy.toFixed(1) + ' m accuracy' },
      { label: 'Link', value: drone.link_type },
      { label: 'Connection', value: drone.connection },
    ],
  }
}

function buildAlertCards(alerts: Alert[]): HawkieCard[] {
  return alerts.slice(0, 3).map((a) => ({
    type: 'alert' as const,
    title: a.title,
    status: a.severity,
    metrics: [
      { label: 'Category', value: a.category },
      { label: 'Action', value: a.recommended_action },
    ],
  }))
}

// ─── Main answer function ─────────────────────────────────────────────────────

export function hawkieAnswer(
  query: string,
  ctx: HawkieContext
): { text: string; cards?: HawkieCard[] } {
  const { isDemo, orders, drones, activeMission, alerts, systemStatus } = ctx
  const intent = detectIntent(query)
  const ds = demoSuffix(isDemo)

  switch (intent) {
    case 'SAFETY_COMMAND': {
      return {
        text: `That's a launch or arming command — I'm a monitoring copilot, not a flight controller.\n\nTo **launch, arm, or disarm** a drone, use the Active Missions panel or the Fleet page. Those controls have the required pre-flight checks built in.`,
      }
    }

    case 'MEDICAL': {
      return {
        text: `I don't provide medical advice. For dosage, treatment protocols, or prescriptions, consult the relevant clinical guidelines or your pharmacy system.\n\nI can help with **order status, fleet health, mission progress, and operational alerts**.`,
      }
    }

    case 'BATTERY': {
      const flyingDrones = drones.filter((d) => ['in_flight', 'preparing', 'launched'].includes(d.status))
      const lowBattery = drones.filter((d) => d.battery < 30)

      if (flyingDrones.length === 0 && lowBattery.length === 0) {
        return {
          text: `No drones currently active. All ${drones.length} drones are grounded with sufficient charge.${ds}`,
        }
      }

      let text = ''
      if (flyingDrones.length > 0) {
        text += `**Active drones (battery):**\n`
        flyingDrones.forEach((d) => {
          const warn = d.battery < 30 ? ' ⚠ Low' : ''
          text += `• ${d.name}: **${d.battery}%**${warn}\n`
        })
      }
      if (lowBattery.length > 0) {
        const names = lowBattery.map((d) => d.name).join(', ')
        text += `\n**Low battery warning:** ${names} — below 30%.`
      }
      text += ds

      return { text, cards: flyingDrones.map(buildDroneCard) }
    }

    case 'GPS_DRONE': {
      const flyingDrone = drones.find((d) => d.status === 'in_flight')
      if (!flyingDrone && !activeMission) {
        return {
          text: `No drone is currently in flight. GPS lock status: **${systemStatus.gps}**.${ds}`,
        }
      }

      if (flyingDrone) {
        return {
          text: `**${flyingDrone.name}** is in flight.\n• Altitude: **${flyingDrone.altitude} m**\n• Speed: **${flyingDrone.speed} m/s**\n• GPS accuracy: **${flyingDrone.gps_accuracy.toFixed(1)} m**\n• Connection: **${flyingDrone.connection}** via ${flyingDrone.link_type}${ds}`,
          cards: [buildDroneCard(flyingDrone)],
        }
      }

      return {
        text: `GPS system status: **${systemStatus.gps}**. No drone currently in flight.${ds}`,
      }
    }

    case 'TEMPERATURE': {
      const tempStatus = systemStatus.temperature
      const tempLabel =
        tempStatus === 'safe' ? 'within safe range (2–8 °C)' :
        tempStatus === 'warning' ? 'approaching the limit' : 'outside safe range'
      const flyingDrone = drones.find((d) => d.status === 'in_flight')
      let text = `Cold chain temperature is **${tempLabel}**.`
      if (flyingDrone) {
        text += `\n\nThe in-flight drone (${flyingDrone.name}) reports **${flyingDrone.temperature} °C** payload temperature.`
      }
      text += ds
      return { text }
    }

    case 'ETA': {
      if (!activeMission) {
        return { text: `No active mission in flight right now.${ds}` }
      }
      const remaining = Math.max(0, activeMission.eta_minutes - activeMission.elapsed_minutes)
      return {
        text: `Mission **${activeMission.id}** — estimated arrival in **${remaining} min**.\n• Route: ${activeMission.from_location} → ${activeMission.to_location}\n• Elapsed: ${activeMission.elapsed_minutes} of ${activeMission.eta_minutes} min${ds}`,
        cards: buildMissionCards(activeMission, drones),
      }
    }

    case 'ALERTS': {
      const unacked = alerts.filter((a) => !a.acknowledged)
      if (unacked.length === 0) {
        return { text: `No unacknowledged alerts at this time. All clear.${ds}` }
      }
      const critCount = unacked.filter((a) => a.severity === 'critical').length
      const warnCount = unacked.filter((a) => a.severity === 'warning').length
      return {
        text: `**${unacked.length} unacknowledged alert${unacked.length > 1 ? 's' : ''}** — ${critCount} critical, ${warnCount} warning.\n\nReview and acknowledge in the Alert Center.${ds}`,
        cards: buildAlertCards(unacked),
      }
    }

    case 'LAUNCH_READY': {
      const pendingOrders = orders.filter((o) => o.status === 'pending')
      const availableDrones = drones.filter((d) => d.status === 'available')
      const critAlerts = alerts.filter((a) => a.severity === 'critical' && !a.acknowledged)

      const blockers: string[] = []
      if (availableDrones.length === 0) blockers.push('No drones available')
      if (critAlerts.length > 0) blockers.push(`${critAlerts.length} critical unacknowledged alert(s)`)
      if (systemStatus.gps !== 'locked') blockers.push(`GPS not locked (${systemStatus.gps})`)

      if (blockers.length === 0) {
        return {
          text: `**Launch conditions look favorable.**\n• ${availableDrones.length} drone(s) available\n• GPS: ${systemStatus.gps}\n• No critical alerts\n• ${pendingOrders.length} order(s) pending approval\n\nUse the Active Missions panel to initiate a flight.${ds}`,
        }
      }
      return {
        text: `**Potential blockers detected:**\n${blockers.map((b) => `• ${b}`).join('\n')}\n\nResolve these before launching.${ds}`,
      }
    }

    case 'PENDING': {
      const pending = orders.filter((o) => o.status === 'pending')
      if (pending.length === 0) {
        return { text: `No orders currently pending approval.${ds}` }
      }
      const emergencyPending = pending.filter((o) => o.priority === 'emergency')
      let text = `**${pending.length} order${pending.length > 1 ? 's' : ''} pending approval.**`
      if (emergencyPending.length > 0) {
        text += `\n\n⚠ **${emergencyPending.length} emergency** order(s) need immediate review.`
      }
      text += `\n\nGo to the Orders page to review and approve.${ds}`
      return {
        text,
        cards: pending.slice(0, 3).map((o) => ({
          type: 'order' as const,
          title: `Order ${o.id}`,
          status: o.status,
          metrics: [
            { label: 'Medicine', value: o.medicine },
            { label: 'Priority', value: o.priority },
            { label: 'Doctor', value: o.doctor_name },
            { label: 'Destination', value: o.destination_name },
          ],
        })),
      }
    }

    case 'MISSION': {
      const active = activeMissionsFromOrders(orders)
      if (active.length === 0 && !activeMission) {
        return { text: `No missions currently in flight.${ds}` }
      }
      if (activeMission) {
        const remaining = Math.max(0, activeMission.eta_minutes - activeMission.elapsed_minutes)
        return {
          text: `**Mission ${activeMission.id}** is active — status: **${activeMission.status}**.\n• Medicine: ${activeMission.medicine} × ${activeMission.quantity}\n• Route: ${activeMission.from_location} → ${activeMission.to_location}\n• ETA: **${remaining} min** remaining\n• Priority: ${activeMission.priority}${ds}`,
          cards: buildMissionCards(activeMission, drones),
        }
      }
      return {
        text: `**${active.length} mission(s)** currently active.${ds}`,
      }
    }

    case 'NETWORK': {
      const { fourG, zerotier, websocket, backend } = systemStatus
      return {
        text: `**Network status:**\n• 4G: **${fourG}**\n• ZeroTier VPN: **${zerotier}**\n• WebSocket: **${websocket}**\n• Backend: **${backend}**${ds}`,
      }
    }

    case 'FLEET': {
      const statusCounts: Record<string, number> = {}
      drones.forEach((d) => {
        statusCounts[d.status] = (statusCounts[d.status] ?? 0) + 1
      })
      const summary = Object.entries(statusCounts)
        .map(([s, n]) => `• ${s}: **${n}**`)
        .join('\n')
      const lowBattery = drones.filter((d) => d.battery < 30)
      let text = `**Fleet overview — ${drones.length} drone(s):**\n${summary}`
      if (lowBattery.length > 0) {
        text += `\n\n⚠ ${lowBattery.map((d) => d.name).join(', ')} below 30% battery.`
      }
      text += ds
      return {
        text,
        cards: drones.map(buildDroneCard),
      }
    }

    case 'HISTORY': {
      const completed = orders.filter((o) => ['delivered', 'verified', 'cancelled'].includes(o.status))
      return {
        text: `**${completed.length} completed order(s)** in this session.\n\nFor full delivery history and analytics, visit the History or Analytics pages.${ds}`,
      }
    }

    case 'SITUATION':
    default: {
      return { text: hawkieSituation(ctx), cards: buildMissionCards(activeMission, drones) }
    }
  }
}

// ─── Situation summary ────────────────────────────────────────────────────────

export function hawkieSituation(ctx: HawkieContext): string {
  const { isDemo, orders, drones, activeMission, alerts, systemStatus } = ctx
  const ds = demoSuffix(isDemo)

  const activeOrders = activeMissionsFromOrders(orders)
  const pendingOrders = orders.filter((o) => o.status === 'pending')
  const availableDrones = drones.filter((d) => d.status === 'available')
  const unackedAlerts = alerts.filter((a) => !a.acknowledged)
  const critAlerts = unackedAlerts.filter((a) => a.severity === 'critical')

  const lines: string[] = []

  if (activeMission) {
    const remaining = Math.max(0, activeMission.eta_minutes - activeMission.elapsed_minutes)
    lines.push(`**Mission in progress:** ${activeMission.id} — ${activeMission.medicine} en route to ${activeMission.to_location}, ETA **${remaining} min**.`)
  } else if (activeOrders.length > 0) {
    lines.push(`**${activeOrders.length} order(s)** currently active (launched or in flight).`)
  } else {
    lines.push(`No missions currently in flight.`)
  }

  lines.push(`${availableDrones.length} of ${drones.length} drone(s) available. ${pendingOrders.length} order(s) awaiting approval.`)

  if (critAlerts.length > 0) {
    lines.push(`⚠ **${critAlerts.length} critical alert(s)** require attention.`)
  } else if (unackedAlerts.length > 0) {
    lines.push(`${unackedAlerts.length} unacknowledged alert(s) — no critical issues.`)
  } else {
    lines.push(`No active alerts. Operations nominal.`)
  }

  const netIssues = [
    systemStatus.fourG !== 'connected' && `4G ${systemStatus.fourG}`,
    systemStatus.zerotier !== 'connected' && `ZeroTier ${systemStatus.zerotier}`,
    systemStatus.gps !== 'locked' && `GPS ${systemStatus.gps}`,
  ].filter(Boolean)
  if (netIssues.length > 0) {
    lines.push(`Network note: ${netIssues.join(', ')}.`)
  }

  return lines.join('\n\n') + ds
}

// ─── Suggested questions ──────────────────────────────────────────────────────

export function suggestedQuestions(ctx: HawkieContext): string[] {
  const { orders, drones, activeMission, alerts } = ctx
  const questions: string[] = []

  if (activeMission) {
    questions.push(`What is the ETA for the current mission?`)
  } else {
    questions.push(`Are there any pending orders that need review?`)
  }

  const inFlightDrone = drones.find((d) => d.status === 'in_flight')
  if (inFlightDrone) {
    questions.push(`What is ${inFlightDrone.name}'s battery and GPS status?`)
  } else {
    questions.push(`What is the fleet status right now?`)
  }

  const unacked = alerts.filter((a) => !a.acknowledged)
  if (unacked.length > 0) {
    questions.push(`What are the current unacknowledged alerts?`)
  } else {
    questions.push(`Is the system ready for a launch?`)
  }

  const pending = orders.filter((o) => o.status === 'pending')
  if (pending.length > 0) {
    questions.push(`Show me orders pending approval.`)
  } else {
    questions.push(`What is the current network and connection status?`)
  }

  return questions.slice(0, 4)
}
