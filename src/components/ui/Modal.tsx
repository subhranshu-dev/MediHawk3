import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { clsx } from 'clsx'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  subtitle?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

export function Modal({ open, onClose, title, subtitle, children, size = 'md', className }: ModalProps) {
  const maxW = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size]

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={clsx(
              'fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none'
            )}
          >
            <div className={clsx(
              'w-full pointer-events-auto',
              'bg-panel border border-white/10 rounded-lg shadow-elevation-3',
              maxW, className
            )}>
              {(title || subtitle) && (
                <div className="flex items-start justify-between px-6 py-4 border-b border-white/8">
                  <div>
                    {title && <h2 className="text-text-primary font-semibold text-base tracking-wide">{title}</h2>}
                    {subtitle && <p className="text-text-secondary text-xs mt-0.5">{subtitle}</p>}
                  </div>
                  <button onClick={onClose} className="btn-ghost p-1 -mr-1">
                    <X size={16} />
                  </button>
                </div>
              )}
              <div className="p-6">{children}</div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
