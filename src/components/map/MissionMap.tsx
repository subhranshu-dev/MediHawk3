import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useStore } from '@/store'
import type { Drone, Mission } from '@/types'

// Fix Leaflet default icons
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Hub marker — medical green square
const hubIcon = L.divIcon({
  className: '',
  html: `<div style="width:30px;height:30px;background:rgba(31,157,104,0.18);border:2px solid rgba(31,157,104,0.75);border-radius:5px;display:flex;align-items:center;justify-content:center;">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1F9D68" stroke-width="2.5">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M12 8v8M8 12h8"/>
    </svg>
  </div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
})

// Destination marker — amber location pin
const destIcon = L.divIcon({
  className: '',
  html: `<div style="width:30px;height:36px;display:flex;flex-direction:column;align-items:center;">
    <div style="width:28px;height:28px;background:rgba(217,139,36,0.18);border:2px solid rgba(217,139,36,0.75);border-radius:50%;display:flex;align-items:center;justify-content:center;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="#D98B24">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
      </svg>
    </div>
    <div style="width:2px;height:8px;background:rgba(217,139,36,0.6);margin-top:-1px;"></div>
  </div>`,
  iconSize: [30, 36],
  iconAnchor: [15, 36],
})

// Build a drone icon with heading rotation and per-drone coloring
function makeDroneIcon(headingDeg: number, isSelected: boolean): L.DivIcon {
  const color = isSelected ? '#C62832' : '#C62832'
  const glowColor = isSelected ? 'rgba(198,40,50,0.5)' : 'rgba(198,40,50,0.3)'
  const bgOpacity = isSelected ? 0.22 : 0.14
  return L.divIcon({
    className: '',
    html: `<div style="
      width:40px;height:40px;
      display:flex;align-items:center;justify-content:center;
      transform:rotate(${headingDeg}deg);
      filter:drop-shadow(0 0 8px ${glowColor});
    ">
      <svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Glow disc -->
        <circle cx="19" cy="19" r="18" fill="${color}" fill-opacity="${bgOpacity}" stroke="${color}" stroke-width="1" stroke-opacity="0.5"/>
        <!-- Rotor arms -->
        <line x1="19" y1="19" x2="6" y2="6" stroke="${color}" stroke-width="1.8" stroke-opacity="0.8"/>
        <line x1="19" y1="19" x2="32" y2="6" stroke="${color}" stroke-width="1.8" stroke-opacity="0.8"/>
        <line x1="19" y1="19" x2="6" y2="32" stroke="${color}" stroke-width="1.8" stroke-opacity="0.8"/>
        <line x1="19" y1="19" x2="32" y2="32" stroke="${color}" stroke-width="1.8" stroke-opacity="0.8"/>
        <!-- Rotor discs -->
        <circle cx="6" cy="6" r="4.5" fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-width="1.5" stroke-opacity="0.7"/>
        <circle cx="32" cy="6" r="4.5" fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-width="1.5" stroke-opacity="0.7"/>
        <circle cx="6" cy="32" r="4.5" fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-width="1.5" stroke-opacity="0.7"/>
        <circle cx="32" cy="32" r="4.5" fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-width="1.5" stroke-opacity="0.7"/>
        <!-- Body -->
        <circle cx="19" cy="19" r="5.5" fill="${color}" fill-opacity="0.9"/>
        <!-- Medical cross -->
        <rect x="17" y="14.5" width="4" height="9" rx="1" fill="white" fill-opacity="0.95"/>
        <rect x="14.5" y="17" width="9" height="4" rx="1" fill="white" fill-opacity="0.95"/>
        <!-- Forward indicator (top) -->
        <polygon points="19,9 17,12 21,12" fill="${color}" fill-opacity="0.9"/>
      </svg>
    </div>
    <style>
      @keyframes droneHover { 0%,100%{transform:translateY(0) rotate(${headingDeg}deg)} 50%{transform:translateY(-3px) rotate(${headingDeg}deg)} }
    </style>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  })
}

// Heading in degrees (0=north, 90=east) from (lat1,lng1) toward (lat2,lng2)
function computeHeading(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = lat2 - lat1
  const dLng = lng2 - lng1
  return (Math.atan2(dLng, dLat) * 180) / Math.PI
}

// Move (lat,lng) toward (toLat,toLng) by speed (km/h) over dt (ms)
function interpolateToward(
  lat: number, lng: number,
  toLat: number, toLng: number,
  speedKmh: number, dtMs: number,
): [number, number] {
  const dLat = toLat - lat
  const dLng = toLng - lng
  const distDeg = Math.hypot(dLat, dLng)
  if (distDeg < 1e-7) return [lat, lng]
  // km/h → deg/ms  (1 deg ≈ 111.32 km)
  const speedDegMs = speedKmh / 3_600_000 / 111.32
  const stepDeg = speedDegMs * dtMs
  const ratio = Math.min(stepDeg / distDeg, 1)
  return [lat + dLat * ratio, lng + dLng * ratio]
}

// Component that follows the first active drone
function MapFollower({ droneId, lat, lng }: { droneId: string; lat: number; lng: number }) {
  const map = useMap()
  const prevDroneRef = useRef<string | null>(null)
  useEffect(() => {
    if (prevDroneRef.current !== droneId) {
      // New drone selected — pan to it
      map.setView([lat, lng], Math.max(map.getZoom(), 12), { animate: true })
      prevDroneRef.current = droneId
    }
  }, [droneId])
  return null
}

interface MissionMapProps {
  height?: number
  className?: string
  followDrone?: boolean
}

const MAX_TRAIL_POINTS = 60

export function MissionMap({ height = 400, className, followDrone = true }: MissionMapProps) {
  const { drones, activeMissions } = useStore()

  // Memoised so the reference is stable between 100ms smooth-pos renders
  const activeDrones = useMemo(
    () => drones.filter((d) => ['preparing', 'in_flight', 'returning'].includes(d.status)),
    [drones],
  )

  // Smooth positions: interpolated between 5-second backend polls
  // keyed by drone.id → [lat, lng]
  const [smoothPos, setSmoothPos] = useState<Map<string, [number, number]>>(() => {
    const m = new Map<string, [number, number]>()
    activeDrones.forEach((d) => m.set(d.id, [d.lat, d.lng]))
    return m
  })

  // Flight trail: accumulated positions keyed by drone.id
  const trailRef = useRef<Map<string, [number, number][]>>(new Map())

  // Sync smooth positions when backend data changes
  useEffect(() => {
    setSmoothPos((prev) => {
      const next = new Map(prev)
      activeDrones.forEach((d) => {
        const cur = prev.get(d.id)
        // Reset to actual backend position if it differs significantly (> ~50m)
        if (!cur || Math.hypot(d.lat - cur[0], d.lng - cur[1]) > 0.0005) {
          next.set(d.id, [d.lat, d.lng])
        }
      })
      // Remove stale drones
      next.forEach((_, id) => { if (!activeDrones.find((d) => d.id === id)) next.delete(id) })
      return next
    })
  }, [drones])

  // 100ms interpolation loop — moves each drone smoothly toward its destination
  useEffect(() => {
    if (activeDrones.length === 0) return
    const id = setInterval(() => {
      setSmoothPos((prev) => {
        const next = new Map(prev)
        activeDrones.forEach((drone) => {
          if (drone.speed < 0.5) return // stationary
          const mission = activeMissions.find((m) => m.id === drone.mission_id)
          if (!mission) return
          const [lat, lng] = prev.get(drone.id) ?? [drone.lat, drone.lng]
          const toLat = drone.status === 'returning' ? mission.from_lat : mission.to_lat
          const toLng = drone.status === 'returning' ? mission.from_lng : mission.to_lng
          const [nLat, nLng] = interpolateToward(lat, lng, toLat, toLng, drone.speed, 100)
          next.set(drone.id, [nLat, nLng])

          // Accumulate trail
          const trail = trailRef.current.get(drone.id) ?? []
          const last = trail[trail.length - 1]
          if (!last || Math.hypot(nLat - last[0], nLng - last[1]) > 0.0001) {
            const updated = [...trail, [nLat, nLng] as [number, number]]
            trailRef.current.set(drone.id, updated.slice(-MAX_TRAIL_POINTS))
          }
        })
        return next
      })
    }, 100)
    return () => clearInterval(id)
  }, [activeDrones, activeMissions])

  // Map center: midpoint of all active drones, or Bhubaneswar fallback
  const center: [number, number] = (() => {
    if (activeDrones.length === 0) return [20.2961, 85.8189]
    const latSum = activeDrones.reduce((s, d) => s + d.lat, 0)
    const lngSum = activeDrones.reduce((s, d) => s + d.lng, 0)
    return [latSum / activeDrones.length, lngSum / activeDrones.length]
  })()

  const firstActiveDrone = activeDrones[0]

  return (
    <div style={{ height }} className={className}>
      <MapContainer
        center={center}
        zoom={12}
        style={{ height: '100%', width: '100%', background: '#D5E1E6' }}
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
        />

        {/* Auto-follow first active drone */}
        {followDrone && firstActiveDrone && (
          <MapFollower
            droneId={firstActiveDrone.id}
            lat={smoothPos.get(firstActiveDrone.id)?.[0] ?? firstActiveDrone.lat}
            lng={smoothPos.get(firstActiveDrone.id)?.[1] ?? firstActiveDrone.lng}
          />
        )}

        {/* Per-mission route lines and markers */}
        {activeMissions.map((mission) => {
          const routeCoords: [number, number][] = mission.waypoints?.map((wp) => [wp.lat, wp.lng]) ?? [
            [mission.from_lat, mission.from_lng],
            [mission.to_lat, mission.to_lng],
          ]
          const completedCoords: [number, number][] = mission.waypoints
            ? mission.waypoints.filter((wp) => wp.reached).map((wp) => [wp.lat, wp.lng])
            : []

          return (
            <Fragment key={mission.id}>
              {/* Full route — dashed */}
              {routeCoords.length >= 2 && (
                <Polyline
                  positions={routeCoords}
                  pathOptions={{ color: 'rgba(198,40,50,0.28)', weight: 3, dashArray: '8,6' }}
                />
              )}
              {/* Completed route — solid */}
              {completedCoords.length >= 2 && (
                <Polyline
                  positions={completedCoords}
                  pathOptions={{ color: '#C62832', weight: 3 }}
                />
              )}
              {/* Corridor band */}
              {routeCoords.length >= 2 && (
                <Polyline
                  positions={routeCoords}
                  pathOptions={{ color: 'rgba(198,40,50,0.04)', weight: 44 }}
                />
              )}
              {/* Waypoint dots */}
              {mission.waypoints?.slice(1, -1).map((wp) => (
                <CircleMarker
                  key={`${mission.id}-wp-${wp.index}`}
                  center={[wp.lat, wp.lng]}
                  radius={4}
                  pathOptions={{
                    color: wp.reached ? '#1F9D68' : 'rgba(198,40,50,0.6)',
                    fillColor: wp.reached ? '#187A52' : '#C62832',
                    fillOpacity: 0.8,
                    weight: 2,
                  }}
                >
                  <Popup><span className="text-xs font-mono">{wp.label}</span></Popup>
                </CircleMarker>
              ))}
              {/* Hub origin */}
              <Marker position={[mission.from_lat, mission.from_lng]} icon={hubIcon}>
                <Popup>
                  <div className="text-xs font-semibold">{mission.from_location}</div>
                  <div className="text-2xs text-gray-500">Origin Hub</div>
                </Popup>
              </Marker>
              {/* Destination */}
              <Marker position={[mission.to_lat, mission.to_lng]} icon={destIcon}>
                <Popup>
                  <div className="text-xs font-semibold">{mission.to_location}</div>
                  <div className="text-2xs text-gray-500">{mission.medicine}</div>
                </Popup>
              </Marker>
            </Fragment>
          )
        })}

        {/* Per-drone flight trails */}
        {activeDrones.map((drone) => {
          const trail = trailRef.current.get(drone.id) ?? []
          if (trail.length < 2) return null
          return (
            <Polyline
              key={`trail-${drone.id}`}
              positions={trail}
              pathOptions={{ color: 'rgba(198,40,50,0.55)', weight: 2, dashArray: '4,3' }}
            />
          )
        })}

        {/* Per-drone markers */}
        {activeDrones.map((drone) => {
          const [lat, lng] = smoothPos.get(drone.id) ?? [drone.lat, drone.lng]
          const mission = activeMissions.find((m) => m.id === drone.mission_id)
          const toLat = mission ? (drone.status === 'returning' ? mission.from_lat : mission.to_lat) : lat
          const toLng = mission ? (drone.status === 'returning' ? mission.from_lng : mission.to_lng) : lng
          const heading = computeHeading(lat, lng, toLat, toLng)
          const icon = makeDroneIcon(heading, true)
          const eta = mission?.eta_minutes ?? 0

          return (
            <Marker key={drone.id} position={[lat, lng]} icon={icon}>
              <Popup>
                <div className="text-xs min-w-[160px]">
                  <p className="font-bold text-sm mb-1">{drone.name}</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                    <span className="text-gray-500">Status</span>
                    <span className="font-semibold capitalize">{drone.status.replace('_', ' ')}</span>
                    <span className="text-gray-500">Speed</span>
                    <span className="font-mono">{drone.speed} km/h</span>
                    <span className="text-gray-500">Altitude</span>
                    <span className="font-mono">{drone.altitude} m</span>
                    <span className="text-gray-500">Battery</span>
                    <span className="font-mono">{drone.battery.toFixed(0)}%</span>
                    {eta > 0 && <>
                      <span className="text-gray-500">ETA</span>
                      <span className="font-mono text-orange-600">{eta} min</span>
                    </>}
                    {mission && <>
                      <span className="text-gray-500">Mission</span>
                      <span className="font-mono text-xs">{mission.id}</span>
                      <span className="text-gray-500">Dest</span>
                      <span>{mission.to_location}</span>
                    </>}
                  </div>
                </div>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>
    </div>
  )
}
