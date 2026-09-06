import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useStore } from '@/store'

// Fix Leaflet default icons
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Custom drone icon
const droneIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:36px; height:36px;
    background: rgba(220,38,38,0.15);
    border: 2px solid rgba(220,38,38,0.8);
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 0 16px rgba(220,38,38,0.4), 0 0 32px rgba(220,38,38,0.15);
    animation: dronepin 1.5s ease-in-out infinite alternate;
  ">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 3L3 8l9 5 9-5-9-5z" fill="#EF4444"/>
      <path d="M3 14l9 5 9-5" stroke="#EF4444" stroke-width="1.5" fill="none"/>
    </svg>
  </div>
  <style>
    @keyframes dronepin { from { transform: translateY(0); } to { transform: translateY(-4px); } }
  </style>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
})

const hubIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:28px; height:28px;
    background: rgba(22,163,74,0.2);
    border: 2px solid rgba(22,163,74,0.7);
    border-radius: 4px;
    display: flex; align-items: center; justify-content: center;
  ">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#22C55E">
      <rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="#22C55E" stroke-width="2"/>
      <path d="M12 8v8M8 12h8" stroke="#22C55E" stroke-width="2"/>
    </svg>
  </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
})

const destIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:28px; height:28px;
    background: rgba(217,119,6,0.2);
    border: 2px solid rgba(217,119,6,0.7);
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
  ">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
      <circle cx="12" cy="9" r="2.5" fill="#F59E0B"/>
    </svg>
  </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
})

function DroneMover() {
  const map = useMap()
  const { drones, activeMission } = useStore()
  const flyingDrone = drones.find((d) => d.status === 'in_flight' || d.status === 'returning')

  useEffect(() => {
    if (flyingDrone && activeMission) {
      map.setView([flyingDrone.lat, flyingDrone.lng], map.getZoom(), { animate: true })
    }
  }, [flyingDrone?.lat, flyingDrone?.lng])

  return null
}

interface MissionMapProps {
  height?: number
  className?: string
  followDrone?: boolean
}

export function MissionMap({ height = 400, className, followDrone = true }: MissionMapProps) {
  const { drones, activeMission } = useStore()
  const flyingDrone = drones.find((d) => d.mission_id)

  const routeCoords: [number, number][] = activeMission?.waypoints.map((wp) => [wp.lat, wp.lng]) ?? []
  const completedCoords: [number, number][] = activeMission?.waypoints
    .filter((wp) => wp.reached)
    .map((wp) => [wp.lat, wp.lng]) ?? []

  const center: [number, number] = activeMission
    ? [(activeMission.from_lat + activeMission.to_lat) / 2, (activeMission.from_lng + activeMission.to_lng) / 2]
    : [20.2961, 85.8189]

  return (
    <div style={{ height }} className={className}>
      <MapContainer
        center={center}
        zoom={12}
        style={{ height: '100%', width: '100%', background: '#08090C' }}
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution=""
        />

        {followDrone && <DroneMover />}

        {/* Full route */}
        {routeCoords.length > 1 && (
          <Polyline
            positions={routeCoords}
            pathOptions={{ color: 'rgba(220,38,38,0.25)', weight: 3, dashArray: '8,6' }}
          />
        )}

        {/* Completed route */}
        {completedCoords.length > 1 && (
          <Polyline
            positions={completedCoords}
            pathOptions={{ color: '#EF4444', weight: 3 }}
          />
        )}

        {/* Mission corridor band */}
        {routeCoords.length > 1 && (
          <Polyline
            positions={routeCoords}
            pathOptions={{ color: 'rgba(220,38,38,0.06)', weight: 40 }}
          />
        )}

        {/* Waypoints */}
        {activeMission?.waypoints.slice(1, -1).map((wp) => (
          <CircleMarker
            key={wp.index}
            center={[wp.lat, wp.lng]}
            radius={5}
            pathOptions={{
              color: wp.reached ? '#22C55E' : 'rgba(220,38,38,0.6)',
              fillColor: wp.reached ? '#16A34A' : '#DC2626',
              fillOpacity: 0.8,
              weight: 2,
            }}
          >
            <Popup className="dark-popup">
              <span className="text-xs font-mono">{wp.label}</span>
            </Popup>
          </CircleMarker>
        ))}

        {/* Hub marker */}
        {activeMission && (
          <Marker position={[activeMission.from_lat, activeMission.from_lng]} icon={hubIcon}>
            <Popup><span className="text-xs">{activeMission.from_location}</span></Popup>
          </Marker>
        )}

        {/* Destination */}
        {activeMission && (
          <Marker position={[activeMission.to_lat, activeMission.to_lng]} icon={destIcon}>
            <Popup><span className="text-xs">{activeMission.to_location}</span></Popup>
          </Marker>
        )}

        {/* Drone */}
        {flyingDrone && (
          <Marker position={[flyingDrone.lat, flyingDrone.lng]} icon={droneIcon}>
            <Popup>
              <div className="text-xs">
                <p className="font-bold">{flyingDrone.name}</p>
                <p>Alt: {flyingDrone.altitude}m · Speed: {flyingDrone.speed}km/h</p>
                <p>Battery: {flyingDrone.battery.toFixed(0)}%</p>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  )
}
