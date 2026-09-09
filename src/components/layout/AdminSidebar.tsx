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

// Dark graphite sidebar — aerospace navigation surface
const SIDEBAR_BG   = 'rgba(28,40,50,0.97)'
const SIDEBAR_BDR  = 'rgba(255,255,255,0.07)'
const ACTIVE_BG    = 'rgba(198,40,50,0.18)'
const ACTIVE_BDR   = 'rgba(198,40,50,0.35)'
const ACTIVE_COLOR = '#EF8C95'       // lighter crimson readable on dark bg
const ACTIVE_ICON  = '#D62839'
const INACTIVE_CLR = 'rgba(155,185,200,0.82)'
const HOVER_BG     = 'rgba(255,255,255,0.07)'
const HOVER_CLR    = 'rgba(220,235,242,0.95)'

export function AdminSidebar() {
  const { sidebarOpen, setSidebarOpen, alerts, isDemo } = useStore()
  const unacked = alerts.filter((a) => !a.acknowledged).length

  return (
    <aside
      className={clsx(
        'fixed left-0 top-0 bottom-0 z-40 flex flex-col transition-all duration-300',
        sidebarOpen ? 'w-52' : 'w-14'
      )}
      style={{
        background: SIDEBAR_BG,
        backdropFilter: 'blur(16px)',
        borderRight: `1px solid ${SIDEBAR_BDR}`,
        boxShadow: '4px 0 24px rgba(0,0,0,0.22)',
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center justify-between px-3 py-4 min-h-[60px]"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        {sidebarOpen && <MediHawkLogo size="sm" />}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="ml-auto p-1.5 rounded transition-all"
          style={{ color: INACTIVE_CLR }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLElement
            el.style.background = HOVER_BG
            el.style.color = HOVER_CLR
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement
            el.style.background = ''
            el.style.color = INACTIVE_CLR
          }}
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
            className="flex items-center gap-3 px-3 py-2.5 mx-1 rounded transition-all duration-150 group relative"
            style={({ isActive }) => ({
              background: isActive ? ACTIVE_BG : 'transparent',
              border: `1px solid ${isActive ? ACTIVE_BDR : 'transparent'}`,
              color: isActive ? ACTIVE_COLOR : INACTIVE_CLR,
            })}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement
              if (!el.style.background || el.style.background === 'transparent' || el.style.background === '') {
                el.style.background = HOVER_BG
                el.style.color = HOVER_CLR
              }
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement
              // Restore active state if needed (NavLink handles via style prop on re-render)
              // Just clear hover overrides — active state will be restored by NavLink style prop
              const isActive = el.getAttribute('aria-current') === 'page'
              if (!isActive) {
                el.style.background = 'transparent'
                el.style.color = INACTIVE_CLR
              }
            }}
          >
            {({ isActive }) => (
              <>
                {/* Active left accent bar */}
                {isActive && (
                  <span
                    className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r"
                    style={{ background: '#C62832' }}
                  />
                )}

                <item.icon
                  size={16}
                  className="flex-shrink-0 transition-colors"
                  style={{ color: isActive ? ACTIVE_ICON : undefined }}
                />

                {sidebarOpen && (
                  <span
                    className="text-xs font-medium truncate"
                    style={{ color: isActive ? ACTIVE_COLOR : undefined }}
                  >
                    {item.label}
                  </span>
                )}

                {item.label === 'Alert Center' && unacked > 0 && (
                  <span className={clsx(
                    'ml-auto flex-shrink-0 text-2xs font-bold bg-crimson text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center',
                    !sidebarOpen && 'absolute -top-1 -right-1'
                  )}>
                    {unacked}
                  </span>
                )}

                {/* Tooltip when collapsed */}
                {!sidebarOpen && (
                  <span
                    className="absolute left-full ml-2 px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50"
                    style={{
                      background: 'rgba(28,40,50,0.97)',
                      border: '1px solid rgba(255,255,255,0.10)',
                      color: 'rgba(220,235,242,0.92)',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.28)',
                    }}
                  >
                    {item.label}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Demo / simulation badge */}
      {sidebarOpen && isDemo && (
        <div className="px-3 py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div
            className="flex items-center gap-2 px-2 py-1.5 rounded"
            style={{
              background: 'rgba(217,139,36,0.14)',
              border: '1px solid rgba(217,139,36,0.30)',
            }}
          >
            <span
              className="text-2xs font-bold tracking-widest uppercase"
              style={{ color: '#D98B24' }}
            >
              Simulation Mode
            </span>
          </div>
        </div>
      )}
    </aside>
  )
}
