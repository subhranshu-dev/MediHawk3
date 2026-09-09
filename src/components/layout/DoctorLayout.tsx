import { NavLink, useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import { Home, Plus, Navigation, History, LogOut, User, Bell } from 'lucide-react'
import { MediHawkLogo } from '@/components/ui/MediHawkLogo'
import { useStore } from '@/store'

const NAV_ITEMS = [
  { label: 'Home', path: '/doctor', icon: Home, end: true },
  { label: 'Order', path: '/doctor/order', icon: Plus },
  { label: 'Track', path: '/doctor/track', icon: Navigation },
  { label: 'History', path: '/doctor/history', icon: History },
]

export function DoctorLayout({ children }: { children: React.ReactNode }) {
  const { logout, isDemo } = useStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'transparent' }}>
      {/* Top bar */}
      <header className="sticky top-0 z-30"
        style={{
          background: 'rgba(165,192,208,0.92)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(40,62,75,0.22)',
          boxShadow: '0 2px 14px rgba(28,44,56,0.14)',
        }}>
        <div className="flex items-center justify-between px-4 h-14 max-w-2xl mx-auto w-full">
          <MediHawkLogo size="sm" />
          <div className="flex items-center gap-2">
            {isDemo && (
              <span className="text-2xs px-1.5 py-0.5 rounded font-bold tracking-widest uppercase"
                style={{ border: '1px solid rgba(217,139,36,0.28)', color: '#B87010', background: 'rgba(217,139,36,0.07)' }}>
                DEMO
              </span>
            )}
            <button className="p-2 rounded transition-colors text-text-secondary hover:text-text-primary"
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(23,35,43,0.06)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
              <Bell size={16} />
            </button>
            <div className="w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(31,157,104,0.10)', border: '1px solid rgba(31,157,104,0.24)' }}>
              <User size={13} className="text-med-green" />
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded transition-colors text-text-muted hover:text-text-secondary"
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(23,35,43,0.06)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}
              title="Logout"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">
        {children}
      </main>

      {/* Bottom Nav */}
      <nav className="sticky bottom-0"
        style={{
          background: 'rgba(160,188,204,0.94)',
          backdropFilter: 'blur(16px)',
          borderTop: '1px solid rgba(40,62,75,0.22)',
          boxShadow: '0 -2px 14px rgba(28,44,56,0.14)',
        }}>
        <div className="flex max-w-2xl mx-auto w-full">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) => clsx(
                'flex-1 flex flex-col items-center gap-1 py-3 transition-colors',
                isActive ? 'text-crimson' : 'text-text-muted hover:text-text-secondary'
              )}
            >
              {({ isActive }) => (
                <>
                  <item.icon size={20} style={{ color: isActive ? '#C62832' : undefined }} />
                  <span className="text-2xs font-medium">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
