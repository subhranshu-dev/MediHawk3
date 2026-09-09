import { useState, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ToastProvider } from '@/components/ui/Toast'
import { InitSequence } from '@/components/ui/InitSequence'
import { MediHawkAtmosphere } from '@/components/ui/MediHawkAtmosphere'
import { CursorSystem } from '@/components/ui/CursorSystem'
import { useSimulation } from '@/hooks/useSimulation'
import { useStore } from '@/store'

// Landing
import { LandingPage } from '@/pages/landing/LandingPage'

// Auth
import { DoctorLogin } from '@/pages/auth/DoctorLogin'
import { AdminLogin } from '@/pages/auth/AdminLogin'

// Doctor Portal
import { DoctorLayout } from '@/components/layout/DoctorLayout'
import { DoctorHome } from '@/pages/doctor/DoctorHome'
import { DoctorOrder } from '@/pages/doctor/DoctorOrder'
import { DoctorTrack } from '@/pages/doctor/DoctorTrack'
import { DoctorHistory } from '@/pages/doctor/DoctorHistory'

// Admin
import { AdminSidebar } from '@/components/layout/AdminSidebar'
import { AdminLayout } from '@/components/layout/AdminTopBar'
import { AdminOverview } from '@/pages/admin/AdminOverview'
import { AdminOrders } from '@/pages/admin/AdminOrders'
import { AdminMissions } from '@/pages/admin/AdminMissions'
import { AdminFleet } from '@/pages/admin/AdminFleet'
import { AdminInventory } from '@/pages/admin/AdminInventory'
import { AdminColdChain } from '@/pages/admin/AdminColdChain'
import { AdminSafety } from '@/pages/admin/AdminSafety'
import { AdminAlerts } from '@/pages/admin/AdminAlerts'
import { AdminVerification } from '@/pages/admin/AdminVerification'
import { AdminAnalytics } from '@/pages/admin/AdminAnalytics'
import { AdminLocations } from '@/pages/admin/AdminLocations'
import { AdminHistory } from '@/pages/admin/AdminHistory'
import { AdminDemoControls } from '@/pages/admin/AdminDemoControls'

function RequireAuth({ children, role }: { children: React.ReactNode; role?: 'doctor' | 'admin' }) {
  const { user } = useStore()
  if (!user) return <Navigate to={role === 'admin' ? '/auth/admin' : '/auth/doctor'} replace />
  if (role && user.role !== role) return <Navigate to="/" replace />
  return <>{children}</>
}

function SimulationRunner() {
  useSimulation()
  return null
}

function DoctorPortal() {
  return (
    <RequireAuth role="doctor">
      <DoctorLayout>
        <Routes>
          <Route path="/" element={<DoctorHome />} />
          <Route path="/order" element={<DoctorOrder />} />
          <Route path="/track" element={<DoctorTrack />} />
          <Route path="/history" element={<DoctorHistory />} />
        </Routes>
      </DoctorLayout>
    </RequireAuth>
  )
}

function AdminPortal() {
  return (
    <RequireAuth role="admin">
      <div className="flex min-h-screen">
        <AdminSidebar />
        <div className="flex-1 flex flex-col min-h-screen min-w-0">
          <AdminLayout>
            <div className="flex-1 flex flex-col min-h-0">
              <Routes>
                <Route path="/" element={<AdminOverview />} />
                <Route path="/orders" element={<AdminOrders />} />
                <Route path="/missions" element={<AdminMissions />} />
                <Route path="/fleet" element={<AdminFleet />} />
                <Route path="/inventory" element={<AdminInventory />} />
                <Route path="/coldchain" element={<AdminColdChain />} />
                <Route path="/safety" element={<AdminSafety />} />
                <Route path="/alerts" element={<AdminAlerts />} />
                <Route path="/verification" element={<AdminVerification />} />
                <Route path="/analytics" element={<AdminAnalytics />} />
                <Route path="/locations" element={<AdminLocations />} />
                <Route path="/history" element={<AdminHistory />} />
              </Routes>
              <AdminDemoControls />
            </div>
          </AdminLayout>
        </div>
      </div>
    </RequireAuth>
  )
}

export default function App() {
  const [initComplete, setInitComplete] = useState(false)

  const handleInitComplete = useCallback(() => {
    setInitComplete(true)
  }, [])

  return (
    <BrowserRouter>
      <MediHawkAtmosphere />
      <CursorSystem />
      {/* z-index:1 ensures all page content renders above the fixed atmosphere (z-index:0) */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <ToastProvider>
          <SimulationRunner />
          <InitSequence onComplete={handleInitComplete} />
          {initComplete && (
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/auth/doctor" element={<DoctorLogin />} />
              <Route path="/auth/admin" element={<AdminLogin />} />
              <Route path="/doctor/*" element={<DoctorPortal />} />
              <Route path="/admin/*" element={<AdminPortal />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </ToastProvider>
      </div>
    </BrowserRouter>
  )
}
