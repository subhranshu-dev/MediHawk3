import { Suspense, lazy, useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { MapPin, Phone, User } from 'lucide-react'
import { clsx } from 'clsx'
import { adminService } from '@/services/api'

interface BackendLocation {
  id: string
  name: string
  type: 'hub' | 'phc' | 'chc'
  district: string
  address: string
  contact: string
  doctor: string | null
  lat: number
  lng: number
  is_active: boolean
}

export function AdminLocations() {
  const [locations, setLocations] = useState<BackendLocation[]>([])
  useEffect(() => {
    adminService.locations().then((r) => {
      const data = r as { locations?: BackendLocation[] }
      setLocations(data.locations ?? [])
    }).catch(() => {})
  }, [])
  const hubs = locations.filter(l => l.type === 'hub')
  const phcs = locations.filter(l => l.type === 'phc')
  const chcs = locations.filter(l => l.type === 'chc')

  const typeConfig = {
    hub: { label: 'Main Hub', color: 'text-med-green-light bg-med-green/10 border-med-green/25', dot: 'bg-med-green' },
    phc: { label: 'PHC', color: 'text-amber-light bg-amber/10 border-amber/25', dot: 'bg-amber' },
    chc: { label: 'CHC', color: 'text-metal-200 bg-white/8 border-white/15', dot: 'bg-metal-300' },
  }

  return (
    <div className="p-5 flex flex-col gap-5 overflow-auto">
      <div>
        <h1 className="text-lg font-bold text-text-primary">Location Management</h1>
        <p className="text-xs text-text-secondary mt-0.5">Hub · PHC · CHC coverage map</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Main Hub', count: hubs.length, color: 'text-med-green-light' },
          { label: 'PHC Locations', count: phcs.length, color: 'text-amber-light' },
          { label: 'CHC Locations', count: chcs.length, color: 'text-metal-200' },
        ].map((s) => (
          <div key={s.label} className="panel p-4 text-center">
            <p className={`font-mono-data font-black text-3xl ${s.color}`}>{s.count}</p>
            <p className="text-2xs text-text-muted mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Location cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {locations.map((loc, i) => {
          const cfg = typeConfig[loc.type]
          return (
            <motion.div
              key={loc.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="panel p-5"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={clsx('w-3 h-3 rounded-full flex-shrink-0', cfg.dot)} />
                  <div>
                    <h3 className="text-sm font-bold text-text-primary">{loc.name}</h3>
                    <p className="text-2xs text-text-muted">{loc.district} District</p>
                  </div>
                </div>
                <span className={clsx('text-2xs font-bold uppercase px-2 py-0.5 rounded border', cfg.color)}>
                  {cfg.label}
                </span>
              </div>

              <div className="flex flex-col gap-2 text-xs">
                <div className="flex items-start gap-2">
                  <MapPin size={12} className="text-text-muted mt-0.5 flex-shrink-0" />
                  <span className="text-text-secondary">{loc.address}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone size={12} className="text-text-muted flex-shrink-0" />
                  <span className="font-mono-data text-text-secondary">{loc.contact}</span>
                </div>
                {loc.doctor && (
                  <div className="flex items-center gap-2">
                    <User size={12} className="text-text-muted flex-shrink-0" />
                    <span className="text-text-secondary">{loc.doctor}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <span className="telemetry-label">Coordinates</span>
                  <span className="font-mono-data text-text-muted text-2xs">{loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}</span>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
