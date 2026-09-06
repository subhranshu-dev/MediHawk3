import { NavLink, useLocation } from 'react-router-dom'
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
      'bg-graphite border-r border-white/6',
      sidebarOpen ? 'w-52' : 'w-14'
    )}>
      {/* Logo */}
      <div className="flex items-center justify-between px-3 py-4 border-b border-white/6 min-h-[60px]">
        {sidebarOpen && <MediHawkLogo size="sm" />}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="ml-auto p-1.5 rounded hover:bg-white/5 text-text-muted hover:text-text-secondary transition-colors"
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
                ? 'bg-crimson/10 text-text-primary border border-crimson/20'
                : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
            )}
          >
            {({ isActive }) => (
              <>
                <item.icon
                  size={16}
                  className={clsx(
                    'flex-shrink-0 transition-colors',
                    isActive ? 'text-crimson-light' : 'text-text-muted group-hover:text-text-secondary'
                  )}
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
                  <span className="absolute left-full ml-2 px-2 py-1 rounded bg-elevated border border-white/10 text-xs text-text-primary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
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
        <div className="px-3 py-2 border-t border-white/6">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-amber-glow border border-amber/20">
            <span className="text-2xs text-amber-light font-bold tracking-widest uppercase">Simulation Mode</span>
          </div>
        </div>
      )}
    </aside>
  )
}
