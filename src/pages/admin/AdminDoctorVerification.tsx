import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { UserCheck, UserX, UserMinus, Key, RefreshCw, Plus, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react'
import { clsx } from 'clsx'
import { adminService } from '@/services/api'
import { useToast } from '@/components/ui/Toast'

interface PendingDoctor {
  id: string
  name: string
  email: string
  phone: string
  medical_registration_no: string | null
  phc: string | null
  phc_name: string | null
  verification_status: string
  verified_at: string | null
  created_at: string | null
  verification_notes: string | null
}

interface Invitation {
  id: string
  facility_id: string
  facility_name: string | null
  used: boolean
  revoked: boolean
  expires_at: string | null
  used_at: string | null
  created_at: string | null
}

type Tab = 'pending' | 'invitations'

export function AdminDoctorVerification() {
  const { toast } = useToast()
  const [tab, setTab] = useState<Tab>('pending')
  const [pendingDoctors, setPendingDoctors] = useState<PendingDoctor[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [notesMap, setNotesMap] = useState<Record<string, string>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Invitation creation state
  const [newFacilityId, setNewFacilityId] = useState('')
  const [creatingInv, setCreatingInv] = useState(false)
  const [newCode, setNewCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const loadPending = useCallback(async () => {
    setLoading(true)
    try {
      const data = await adminService.listPendingDoctors() as { doctors: PendingDoctor[] }
      setPendingDoctors(data.doctors ?? [])
    } catch {
      toast('error', 'Failed to load', 'Could not fetch pending doctors')
    } finally {
      setLoading(false)
    }
  }, [toast])

  const loadInvitations = useCallback(async () => {
    setLoading(true)
    try {
      const data = await adminService.listDoctorInvitations() as { invitations: Invitation[] }
      setInvitations(data.invitations ?? [])
    } catch {
      toast('error', 'Failed to load', 'Could not fetch invitations')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (tab === 'pending') loadPending()
    else loadInvitations()
  }, [tab, loadPending, loadInvitations])

  const handleApprove = async (doctorId: string) => {
    setActionLoading(doctorId + '-approve')
    try {
      await adminService.approveDoctorVerification(doctorId, notesMap[doctorId])
      toast('success', 'Doctor Approved', 'Registration approved successfully')
      await loadPending()
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast('error', 'Failed', e.message ?? 'Could not approve doctor')
    } finally {
      setActionLoading(null)
    }
  }

  const handleReject = async (doctorId: string) => {
    setActionLoading(doctorId + '-reject')
    try {
      await adminService.rejectDoctorVerification(doctorId, notesMap[doctorId])
      toast('success', 'Doctor Rejected', 'Registration rejected')
      await loadPending()
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast('error', 'Failed', e.message ?? 'Could not reject doctor')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRevoke = async (invId: string) => {
    setActionLoading(invId + '-revoke')
    try {
      await adminService.revokeInvitation(invId)
      toast('success', 'Revoked', 'Invitation revoked')
      await loadInvitations()
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast('error', 'Failed', e.message ?? 'Could not revoke invitation')
    } finally {
      setActionLoading(null)
    }
  }

  const handleCreateInvitation = async () => {
    if (!newFacilityId.trim()) return
    setCreatingInv(true)
    setNewCode(null)
    try {
      const data = await adminService.createDoctorInvitation(newFacilityId.trim()) as { invitation_id: string; code: string; facility_name: string | null; expires_at: string }
      setNewCode(data.code)
      toast('success', 'Invitation Created', `Code created for ${data.facility_name ?? newFacilityId}`)
      setNewFacilityId('')
      await loadInvitations()
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast('error', 'Failed', e.message ?? 'Could not create invitation')
    } finally {
      setCreatingInv(false)
    }
  }

  const copyCode = async () => {
    if (!newCode) return
    await navigator.clipboard.writeText(newCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="p-5 flex flex-col gap-5 overflow-auto max-w-3xl mx-auto">
      <div>
        <h1 className="text-lg font-bold text-text-primary">Doctor Registration Verification</h1>
        <p className="text-xs text-text-secondary mt-0.5">Review pending registrations and manage invitation codes</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
        {(['pending', 'invitations'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'flex-1 py-2 text-xs font-semibold rounded capitalize transition-all',
              tab === t
                ? 'bg-crimson text-white'
                : 'text-text-muted hover:text-text-secondary'
            )}
          >
            {t === 'pending' ? `Pending Approvals${pendingDoctors.length > 0 ? ` (${pendingDoctors.length})` : ''}` : 'Invitation Codes'}
          </button>
        ))}
      </div>

      {/* Pending Doctors Tab */}
      {tab === 'pending' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">{pendingDoctors.length} doctor{pendingDoctors.length !== 1 ? 's' : ''} awaiting review</span>
            <button onClick={loadPending} disabled={loading}
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>

          {loading && <div className="text-center py-8 text-text-muted text-sm">Loading…</div>}

          {!loading && pendingDoctors.length === 0 && (
            <div className="panel p-8 text-center">
              <UserCheck size={32} className="mx-auto mb-3 text-med-green-light opacity-60" />
              <p className="text-sm font-medium text-text-primary">No pending registrations</p>
              <p className="text-xs text-text-muted mt-1">All doctor applications have been reviewed</p>
            </div>
          )}

          {pendingDoctors.map(doc => (
            <motion.div key={doc.id}
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
              className="panel p-4 flex flex-col gap-3"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-text-primary">{doc.name}</p>
                  <p className="text-xs text-text-muted">{doc.email} · {doc.phone}</p>
                  {doc.phc_name && <p className="text-xs text-text-secondary mt-0.5">Facility: {doc.phc_name}</p>}
                </div>
                <button onClick={() => setExpandedId(expandedId === doc.id ? null : doc.id)}
                  className="text-text-muted hover:text-text-secondary transition-colors">
                  {expandedId === doc.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>

              {/* Expanded details */}
              {expandedId === doc.id && (
                <div className="grid grid-cols-2 gap-2 text-xs border-t border-white/6 pt-3">
                  <div>
                    <p className="text-text-muted">Doctor ID</p>
                    <p className="font-mono-data text-text-secondary">{doc.id}</p>
                  </div>
                  <div>
                    <p className="text-text-muted">Registration No.</p>
                    <p className="text-text-secondary">{doc.medical_registration_no ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-text-muted">Applied</p>
                    <p className="text-text-secondary">{doc.created_at ? new Date(doc.created_at).toLocaleDateString() : '—'}</p>
                  </div>
                </div>
              )}

              {/* Notes input */}
              <textarea
                rows={2}
                value={notesMap[doc.id] ?? ''}
                onChange={e => setNotesMap(prev => ({ ...prev, [doc.id]: e.target.value }))}
                placeholder="Optional review notes…"
                className="w-full px-3 py-2 text-xs rounded resize-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(220,235,242,0.85)', outline: 'none' }}
              />

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleApprove(doc.id)}
                  disabled={actionLoading === doc.id + '-approve'}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all"
                  style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.30)', color: '#4ade80' }}
                >
                  <UserCheck size={12} />
                  {actionLoading === doc.id + '-approve' ? 'Approving…' : 'Approve'}
                </button>
                <button
                  onClick={() => handleReject(doc.id)}
                  disabled={actionLoading === doc.id + '-reject'}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all"
                  style={{ background: 'rgba(198,40,50,0.12)', border: '1px solid rgba(198,40,50,0.25)', color: '#EF8C95' }}
                >
                  <UserX size={12} />
                  {actionLoading === doc.id + '-reject' ? 'Rejecting…' : 'Reject'}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Invitations Tab */}
      {tab === 'invitations' && (
        <div className="flex flex-col gap-4">
          {/* Create new invitation */}
          <div className="panel p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Key size={14} className="text-amber-light" />
              <p className="text-sm font-semibold text-text-primary">Create Invitation Code</p>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newFacilityId}
                onChange={e => setNewFacilityId(e.target.value)}
                placeholder="Facility ID (e.g. phc-chandaka)"
                className="flex-1 px-3 py-2 text-xs rounded"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(220,235,242,0.85)', outline: 'none' }}
              />
              <button
                onClick={handleCreateInvitation}
                disabled={creatingInv || !newFacilityId.trim()}
                className="flex items-center gap-1.5 px-3 py-2 rounded text-xs font-semibold transition-all"
                style={{ background: 'rgba(217,139,36,0.15)', border: '1px solid rgba(217,139,36,0.30)', color: '#D98B24' }}
              >
                <Plus size={12} /> {creatingInv ? 'Creating…' : 'Create'}
              </button>
            </div>
            {newCode && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded flex items-start gap-3"
                style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.20)' }}
              >
                <div className="flex-1">
                  <p className="text-xs font-semibold text-med-green-light mb-1">Invitation code created — share securely with the doctor:</p>
                  <p className="font-mono-data text-xs text-text-primary break-all select-all">{newCode}</p>
                  <p className="text-2xs text-text-muted mt-1">This code will NOT be shown again. Copy it now.</p>
                </div>
                <button onClick={copyCode}
                  className="flex-shrink-0 p-1.5 rounded transition-colors"
                  style={{ color: copied ? '#4ade80' : 'rgba(155,185,200,0.7)' }}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </motion.div>
            )}
          </div>

          {/* Invitation list */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">{invitations.length} invitation{invitations.length !== 1 ? 's' : ''}</span>
            <button onClick={loadInvitations} disabled={loading}
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>

          {loading && <div className="text-center py-8 text-text-muted text-sm">Loading…</div>}

          {!loading && invitations.length === 0 && (
            <div className="panel p-8 text-center">
              <Key size={32} className="mx-auto mb-3 text-amber-light opacity-60" />
              <p className="text-sm font-medium text-text-primary">No invitations yet</p>
              <p className="text-xs text-text-muted mt-1">Create an invitation code above to allow doctor registration</p>
            </div>
          )}

          {invitations.map(inv => (
            <div key={inv.id} className="panel p-3 flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-text-primary truncate">{inv.facility_name ?? inv.facility_id}</p>
                  {inv.used && (
                    <span className="text-2xs font-bold px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(34,197,94,0.12)', color: '#4ade80' }}>USED</span>
                  )}
                  {inv.revoked && (
                    <span className="text-2xs font-bold px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(198,40,50,0.12)', color: '#EF8C95' }}>REVOKED</span>
                  )}
                  {!inv.used && !inv.revoked && (
                    <span className="text-2xs font-bold px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(217,139,36,0.12)', color: '#D98B24' }}>ACTIVE</span>
                  )}
                </div>
                <p className="font-mono-data text-2xs text-text-muted mt-0.5">{inv.id}</p>
                {inv.expires_at && (
                  <p className="text-2xs text-text-muted">
                    Expires: {new Date(inv.expires_at).toLocaleDateString()}
                    {inv.used_at && ` · Used: ${new Date(inv.used_at).toLocaleDateString()}`}
                  </p>
                )}
              </div>
              {!inv.used && !inv.revoked && (
                <button
                  onClick={() => handleRevoke(inv.id)}
                  disabled={actionLoading === inv.id + '-revoke'}
                  className="flex items-center gap-1 px-2.5 py-1 rounded text-2xs font-semibold flex-shrink-0 transition-all"
                  style={{ background: 'rgba(198,40,50,0.10)', border: '1px solid rgba(198,40,50,0.20)', color: '#EF8C95' }}
                >
                  <UserMinus size={11} />
                  {actionLoading === inv.id + '-revoke' ? '…' : 'Revoke'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
