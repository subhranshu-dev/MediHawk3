import { Bell, Settings, LogOut, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '@/store'
import { SystemStatusBar } from '@/components/ui/ConnectionIndicator'

export function AdminTopBar() {
  const { user, logout, alerts, isDemo } = useStore()
  const navigate = useNavigate()
  const unacked = alerts.filter((a) => !a.acknowledged).length

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <header className="fixed top-0 right-0 z-30 bg-graphite/95 backdrop-blur-sm border-b border-white/6"
      style={{ left: 'var(--sidebar-width, 208px)' }}>
      <div className="flex items-center justify-between px-5 h-14">
        {/* Breadcrumb / context */}
        <div className="flex items-center gap-2">
          <span className="text-2xs text-text-muted tracking-widest uppercase font-semibold">Admin Command Center</span>
          {isDemo && (
            <span className="text-2xs px-2 py-0.5 rounded border border-amber/30 text-amber bg-amber-glow font-bold tracking-widest uppercase">
              DEMO
            </span>
          )}
        </div>

        {/* Right */}
        <div className="flex items-center gap-1">
          {/* Alert bell */}
          <button
            className="relative p-2 rounded hover:bg-white/5 text-text-secondary hover:text-text-primary transition-colors"
            onClick={() => navigate('/admin/alerts')}
          >
            <Bell size={16} />
            {unacked > 0 && (
              <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-crimson rounded-full flex items-center justify-center text-2xs text-white font-bold">
                {unacked > 9 ? '9+' : unacked}
              </span>
            )}
          </button>

          <button className="p-2 rounded hover:bg-white/5 text-text-secondary hover:text-text-primary transition-colors">
            <Settings size={16} />
          </button>

          {/* User */}
          <div className="flex items-center gap-2 ml-2 pl-2 border-l border-white/8">
            <div className="w-7 h-7 rounded-full bg-crimson/20 border border-crimson/30 flex items-center justify-center">
              <User size={13} className="text-crimson-light" />
            </div>
            <div className="hidden md:flex flex-col leading-none">
              <span className="text-xs font-medium text-text-primary">{user?.name}</span>
              <span className="text-2xs text-text-muted uppercase tracking-wide">Administrator</span>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 ml-1 rounded hover:bg-white/5 text-text-muted hover:text-text-secondary transition-colors"
              title="Logout"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useStore()

  return (
    <div
      className="min-h-screen bg-obsidian"
      style={{ '--sidebar-width': sidebarOpen ? '208px' : '56px' } as React.CSSProperties}
    >
      <AdminTopBar />
      <div
        className="flex flex-col min-h-screen transition-all duration-300"
        style={{ paddingLeft: sidebarOpen ? '208px' : '56px', paddingTop: '56px' }}
      >
        <main className="flex-1 overflow-auto">{children}</main>
        <SystemStatusBar />
      </div>
    </div>
  )
}
