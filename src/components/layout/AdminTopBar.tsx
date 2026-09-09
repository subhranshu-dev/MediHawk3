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
    <header
      className="fixed top-0 right-0 z-30"
      style={{
        left: 'var(--sidebar-width, 208px)',
        background: 'rgba(165,192,208,0.92)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(40,62,75,0.22)',
        boxShadow: '0 2px 14px rgba(28,44,56,0.14)',
      }}
    >
      <div className="flex items-center justify-between px-5 h-14">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2">
          <span className="text-2xs text-text-muted tracking-widest uppercase font-semibold">Admin Command Center</span>
          {isDemo && (
            <span className="text-2xs px-2 py-0.5 rounded font-bold tracking-widest uppercase"
              style={{ border: '1px solid rgba(217,139,36,0.28)', color: '#B87010', background: 'rgba(217,139,36,0.07)' }}>
              DEMO
            </span>
          )}
        </div>

        {/* Right */}
        <div className="flex items-center gap-1">
          <button
            className="relative p-2 rounded transition-colors text-text-secondary hover:text-text-primary"
            style={{ transition: 'background 150ms ease' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(23,35,43,0.06)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}
            onClick={() => navigate('/admin/alerts')}
          >
            <Bell size={16} />
            {unacked > 0 && (
              <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-crimson rounded-full flex items-center justify-center text-2xs text-white font-bold">
                {unacked > 9 ? '9+' : unacked}
              </span>
            )}
          </button>

          <button
            className="p-2 rounded transition-colors text-text-secondary hover:text-text-primary"
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(23,35,43,0.06)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}
          >
            <Settings size={16} />
          </button>

          {/* User */}
          <div className="flex items-center gap-2 ml-2 pl-2" style={{ borderLeft: '1px solid rgba(23,35,43,0.12)' }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(198,40,50,0.10)', border: '1px solid rgba(198,40,50,0.24)' }}>
              <User size={13} className="text-crimson" />
            </div>
            <div className="hidden md:flex flex-col leading-none">
              <span className="text-xs font-medium text-text-primary">{user?.name}</span>
              <span className="text-2xs text-text-muted uppercase tracking-wide">Administrator</span>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 ml-1 rounded transition-colors text-text-muted hover:text-text-secondary"
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(23,25,28,0.06)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}
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
      className="min-h-screen"
      style={{
        background: 'transparent',
        '--sidebar-width': sidebarOpen ? '208px' : '56px',
      } as React.CSSProperties}
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
