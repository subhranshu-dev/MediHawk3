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
  const { user, logout, isDemo } = useStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-obsidian flex flex-col">
      {/* Top bar */}
      <header className="bg-graphite/95 backdrop-blur-sm border-b border-white/6 sticky top-0 z-30">
        <div className="flex items-center justify-between px-4 h-14 max-w-2xl mx-auto w-full">
          <MediHawkLogo size="sm" />
          <div className="flex items-center gap-2">
            {isDemo && (
              <span className="text-2xs px-1.5 py-0.5 rounded border border-amber/30 text-amber bg-amber-glow font-bold tracking-widest uppercase">
                DEMO
              </span>
            )}
            <button className="p-2 rounded hover:bg-white/5 text-text-secondary">
              <Bell size={16} />
            </button>
            <div className="w-7 h-7 rounded-full bg-med-green/20 border border-med-green/30 flex items-center justify-center">
              <User size={13} className="text-med-green-light" />
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded hover:bg-white/5 text-text-muted hover:text-text-secondary"
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
      <nav className="sticky bottom-0 bg-graphite/95 backdrop-blur-sm border-t border-white/8">
        <div className="flex max-w-2xl mx-auto w-full">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) => clsx(
                'flex-1 flex flex-col items-center gap-1 py-3 transition-colors',
                isActive
                  ? 'text-crimson-light'
                  : 'text-text-muted hover:text-text-secondary'
              )}
            >
              {({ isActive }) => (
                <>
                  <item.icon size={20} className={isActive ? 'text-crimson-light' : ''} />
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
