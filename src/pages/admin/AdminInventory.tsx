import { motion } from 'framer-motion'
import { Archive, AlertTriangle, TrendingDown, CheckCircle } from 'lucide-react'
import { INVENTORY } from '@/data/mockData'
import { clsx } from 'clsx'

function StatusCell({ status }: { status: string }) {
  const cfg = {
    in_stock: { label: 'In Stock', class: 'text-med-green bg-med-green-glow border-med-green/25' },
    low_stock: { label: 'Low Stock', class: 'text-amber bg-amber-glow border-amber/25' },
    critical: { label: 'Critical', class: 'text-crimson bg-crimson-glow border-crimson/25' },
    expiring: { label: 'Expiring', class: 'text-amber bg-amber-glow border-amber/25' },
  }[status] ?? { label: status, class: 'text-text-muted bg-white/5 border-white/10' }

  return (
    <span className={clsx('text-2xs font-bold uppercase px-2 py-0.5 rounded border tracking-wide', cfg.class)}>
      {cfg.label}
    </span>
  )
}

export function AdminInventory() {
  const critical = INVENTORY.filter(i => i.status === 'critical' || i.status === 'low_stock')
  const expiring = INVENTORY.filter(i => i.status === 'expiring')

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Archive size={18} className="text-text-secondary" />
            <div>
              <h1 className="text-lg font-bold text-text-primary">Medical Inventory</h1>
              <p className="text-xs text-text-secondary">{INVENTORY.length} items · MediHawk Central Hub</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {critical.length > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-amber-light border border-amber/25 bg-amber-glow px-2 py-1 rounded font-semibold">
                <AlertTriangle size={12} />
                {critical.length} items need attention
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Alert strips */}
      {(critical.length > 0 || expiring.length > 0) && (
        <div className="px-5 py-3 flex flex-col gap-2 border-b border-white/6 bg-amber/3">
          {critical.map((item) => (
            <div key={item.id} className="flex items-center gap-2 text-xs">
              <TrendingDown size={12} className="text-amber-light" />
              <span className="text-amber-light font-semibold">{item.medicine}</span>
              <span className="text-text-muted">— {item.quantity} {item.unit} remaining (threshold: {item.min_threshold})</span>
            </div>
          ))}
          {expiring.map((item) => (
            <div key={item.id} className="flex items-center gap-2 text-xs">
              <AlertTriangle size={12} className="text-amber-light" />
              <span className="text-amber-light font-semibold">{item.medicine}</span>
              <span className="text-text-muted">— expires {item.expiry_date}</span>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/8 sticky top-0 bg-graphite">
              {['Medicine', 'Category', 'Available', 'Unit', 'Temp Range', 'Expiry', 'Status'].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-2xs text-text-muted font-semibold uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {INVENTORY.map((item, i) => (
              <motion.tr
                key={item.id}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ delay: i * 0.04 }}
                className={clsx(
                  'border-b border-white/4 hover:bg-white/2 transition-colors',
                  item.status === 'critical' && 'bg-crimson/3',
                  item.status === 'low_stock' && 'bg-amber/3',
                )}
              >
                <td className="px-5 py-3.5">
                  <p className="text-sm font-semibold text-text-primary">{item.medicine}</p>
                </td>
                <td className="px-5 py-3.5">
                  <span className="text-xs text-text-muted">{item.category}</span>
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <span className={clsx(
                      'font-mono-data font-bold text-base',
                      item.status === 'critical' ? 'text-crimson-light' :
                      item.status === 'low_stock' ? 'text-amber-light' :
                      'text-text-primary'
                    )}>
                      {item.quantity}
                    </span>
                    {item.quantity <= item.min_threshold && (
                      <div className="w-full max-w-[60px] h-1.5 rounded bg-white/8 overflow-hidden">
                        <div
                          className={clsx('h-full rounded', item.status === 'critical' ? 'bg-crimson' : 'bg-amber')}
                          style={{ width: `${Math.min(100, (item.quantity / item.min_threshold) * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <span className="text-xs text-text-secondary">{item.unit}</span>
                </td>
                <td className="px-5 py-3.5">
                  <span className="font-mono-data text-xs text-text-secondary">{item.temperature_required}</span>
                </td>
                <td className="px-5 py-3.5">
                  <span className={clsx('font-mono-data text-xs', item.status === 'expiring' ? 'text-amber-light' : 'text-text-muted')}>
                    {item.expiry_date}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <StatusCell status={item.status} />
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
