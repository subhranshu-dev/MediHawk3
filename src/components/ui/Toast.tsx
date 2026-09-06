import { createContext, useContext, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, AlertTriangle, XCircle, Info, X } from 'lucide-react'
import { clsx } from 'clsx'

type ToastType = 'success' | 'warning' | 'error' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
  title?: string
}

interface ToastContextValue {
  toast: (type: ToastType, message: string, title?: string) => void
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={16} className="text-med-green-light" />,
  warning: <AlertTriangle size={16} className="text-amber-light" />,
  error: <XCircle size={16} className="text-crimson-light" />,
  info: <Info size={16} className="text-metal-200" />,
}

const borderColors: Record<ToastType, string> = {
  success: 'border-med-green/30',
  warning: 'border-amber/30',
  error: 'border-crimson/30',
  info: 'border-metal-400/30',
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback((type: ToastType, message: string, title?: string) => {
    const id = Date.now().toString()
    setToasts((prev) => [...prev, { id, type, message, title }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 32, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 32, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className={clsx(
                'pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-lg',
                'bg-panel border shadow-elevation-2 min-w-[260px] max-w-xs',
                borderColors[t.type]
              )}
            >
              {icons[t.type]}
              <div className="flex-1 min-w-0">
                {t.title && <p className="text-xs font-semibold text-text-primary">{t.title}</p>}
                <p className="text-xs text-text-secondary">{t.message}</p>
              </div>
              <button
                className="text-text-muted hover:text-text-secondary"
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              >
                <X size={12} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
