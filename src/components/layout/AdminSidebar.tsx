import { NavLink } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  LayoutDashboard, Package, Navigation, Cpu, Archive,
  Thermometer, Shield, Bell, CheckSquare, BarChart3,
  History, ChevronLeft, ChevronRight, MapPin
} from 'lucide-react'
import { MediHawkLogo } from '@/components/ui/MediHawkLogo'
import { useStore } from '@/store'

const NAV_ITEMS = [
  { label: 'Command Center', path: '/admin', icon: LayoutDashboard, end: true },
  { label: 'Orders', path: '/admin/orders', icon: Package },
  { label: 'Active Missions', path: '/admin/missions', icon: Navigation },
  { label: 'Fleet', path: '/admin/fleet', icon: Cpu },
  { label: 'Inventory', path: '/admin/inventory', icon: Archive },
  { label: 'Cold Chain', path: '/admin/coldchain', icon: Thermometer },
  { label: 'AI Flight Safety', path: '/admin/safety', icon: Shield },
  { label: 'Alert Center', path: '/admin/alerts', icon: Bell },
  { label: 'Verification', path: '/admin/verification', icon: CheckSquare },
  { label: 'Analytics', path: '/admin/analytics', icon: BarChart3 },
  { label: 'Locations', path: '/admin/locations', icon: MapPin },
  { label: 'History', path: '/admin/history', icon: History },
]

export function AdminSidebar() {
  const { sidebarOpen, setSidebarOpen, alerts, isDemo } = useStore()
  const unacked = alerts.filter((a) => !a.acknowledged).length

  return (
    <aside className={clsx(
      'fixed left-0 top-0 bottom-0 z-40 flex flex-col transition-all duration-300',
      sidebarOpen ? 'w-52' : 'w-14'
    )} style={{
      background: 'rgba(250,250,247,0.92)',
      backdropFilter: 'blur(12px)',
      borderRight: '1px solid rgba(23,25,28,0.10)',
      boxShadow: '2px 0 12px rgba(23,25,28,0.06)',
    }}>
      {/* Logo */}
      <div className="flex items-center justify-between px-3 py-4 min-h-[60px]"
        style={{ borderBottom: '1px solid rgba(23,25,28,0.08)' }}>
        {sidebarOpen && <MediHawkLogo size="sm" />}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="ml-auto p-1.5 rounded transition-colors"
          style={{ color: '#8E9298' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(23,25,28,0.06)'; (e.currentTarget as HTMLElement).style.color = '#17191C'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; (e.currentTarget as HTMLElement).style.color = '#8E9298'; }}
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {sidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 scrollbar-thin">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.end}
            className={({ isActive }) => clsx(
              'flex items-center gap-3 px-3 py-2.5 mx-1 rounded transition-all duration-150 group relative',
              isActive
                ? 'text-crimson-dark'
                : 'text-text-secondary hover:text-text-primary'
            )}
            style={({ isActive }) => isActive ? {
              background: 'rgba(215,25,32,0.07)',
              border: '1px solid rgba(215,25,32,0.18)',
            } : {
              border: '1px solid transparent',
            }}
          >
            {({ isActive }) => (
              <>
                <item.icon
                  size={16}
                  className="flex-shrink-0 transition-colors"
                  style={{ color: isActive ? '#D71920' : undefined }}
                />
                {sidebarOpen && (
                  <span className="text-xs font-medium truncate">{item.label}</span>
                )}
                {item.label === 'Alert Center' && unacked > 0 && (
                  <span className={clsx(
                    'ml-auto flex-shrink-0 text-2xs font-bold bg-crimson text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center',
                    !sidebarOpen && 'absolute -top-1 -right-1'
                  )}>
                    {unacked}
                  </span>
                )}
                {!sidebarOpen && (
                  <span className="absolute left-full ml-2 px-2 py-1 rounded text-xs text-text-primary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50"
                    style={{
                      background: 'rgba(250,250,247,0.96)',
                      border: '1px solid rgba(23,25,28,0.10)',
                      boxShadow: '0 4px 12px rgba(23,25,28,0.10)',
                    }}>
                    {item.label}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Demo badge */}
      {sidebarOpen && isDemo && (
        <div className="px-3 py-2" style={{ borderTop: '1px solid rgba(23,25,28,0.08)' }}>
          <div className="flex items-center gap-2 px-2 py-1.5 rounded"
            style={{ background: 'rgba(224,107,16,0.08)', border: '1px solid rgba(224,107,16,0.22)' }}>
            <span className="text-2xs font-bold tracking-widest uppercase" style={{ color: '#B85700' }}>Simulation Mode</span>
          </div>
        </div>
      )}
    </aside>
  )
}
