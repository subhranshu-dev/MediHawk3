import { useState, useRef, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BrainCircuit, X, Send, WifiOff } from 'lucide-react'
import { useStore } from '@/store'
import {
  hawkieAnswer,
  hawkieSituation,
  suggestedQuestions,
} from '@/services/hawkie'
import type { HawkieMessage, HawkieContext } from '@/services/hawkie'

interface Props {
  portal: 'doctor' | 'admin'
}

// ─── Rich text renderer ───────────────────────────────────────────────────────

function RichText({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <span>
      {lines.map((line, i) => {
        // Parse **bold**
        const parts = line.split(/(\*\*[^*]+\*\*)/g)
        const rendered = parts.map((p, j) => {
          if (p.startsWith('**') && p.endsWith('**')) {
            return <strong key={j}>{p.slice(2, -2)}</strong>
          }
          // Parse _italic_
          const italicParts = p.split(/(_[^_]+_)/g)
          return (
            <span key={j}>
              {italicParts.map((ip, k) => {
                if (ip.startsWith('_') && ip.endsWith('_')) {
                  return <em key={k}>{ip.slice(1, -1)}</em>
                }
                return ip
              })}
            </span>
          )
        })
        return (
          <span key={i}>
            {rendered}
            {i < lines.length - 1 && <br />}
          </span>
        )
      })}
    </span>
  )
}

// ─── Card renderer ────────────────────────────────────────────────────────────

function MessageCard({ card }: { card: import('@/services/hawkie').HawkieCard }) {
  const statusColor =
    card.status === 'in_flight' || card.status === 'launched'
      ? '#1F9D68'
      : card.status === 'critical' || card.status === 'offline'
      ? '#C62832'
      : card.status === 'warning'
      ? '#D98B24'
      : 'rgba(67,88,99,0.7)'

  return (
    <div
      className="mt-2 rounded-lg p-2.5"
      style={{
        background: 'rgba(178,196,207,0.18)',
        border: '1px solid rgba(67,88,99,0.15)',
      }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-text-primary">{card.title}</span>
        <span
          className="text-2xs font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
          style={{
            background: `${statusColor}18`,
            color: statusColor,
            border: `1px solid ${statusColor}30`,
          }}
        >
          {card.status.replace(/_/g, ' ')}
        </span>
      </div>
      {card.metrics && (
        <div className="grid grid-cols-2 gap-1">
          {card.metrics.map((m) => (
            <div key={m.label} className="flex flex-col">
              <span className="telemetry-label" style={{ fontSize: '9px' }}>{m.label}</span>
              <span className="font-mono-data text-2xs text-text-primary">{m.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Processing indicator ─────────────────────────────────────────────────────

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: '#C62832' }}
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.12 }}
        />
      ))}
    </div>
  )
}

// ─── Chat panel ───────────────────────────────────────────────────────────────

interface ChatPanelProps {
  onClose?: () => void
  embedded?: boolean
  portal: 'doctor' | 'admin'
  ctx: HawkieContext
  messages: HawkieMessage[]
  processing: boolean
  onSend: (text: string) => void
  suggested: string[]
}

function ChatPanel({
  onClose,
  embedded = false,
  portal,
  ctx,
  messages,
  processing,
  onSend,
  suggested,
}: ChatPanelProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const offline = ctx.systemStatus.backend === 'disconnected'
  const { alerts, isDemo } = ctx

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, processing])

  const handleSend = useCallback(() => {
    const q = input.trim()
    if (!q || processing) return
    setInput('')
    onSend(q)
  }, [input, processing, onSend])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const unacked = alerts.filter((a) => !a.acknowledged).length

  return (
    <div
      className={embedded ? 'flex flex-col h-full' : 'flex flex-col'}
      style={
        embedded
          ? { background: 'rgba(243,247,249,0.97)', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(67,88,99,0.15)', boxShadow: '0 20px 60px rgba(26,42,54,0.22), 0 8px 24px rgba(26,42,54,0.12)' }
          : { background: 'rgba(243,247,249,0.97)', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(67,88,99,0.15)', boxShadow: '0 20px 60px rgba(26,42,54,0.22), 0 8px 24px rgba(26,42,54,0.12)', minHeight: 400, maxHeight: 560, width: 400, display: 'flex', flexDirection: 'column' }
      }
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(67,88,99,0.12)', background: 'rgba(26,36,44,0.96)' }}
      >
        <div
          className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(198,40,50,0.15)', border: '1px solid rgba(198,40,50,0.3)' }}
        >
          <BrainCircuit size={12} style={{ color: '#C62832' }} />
        </div>
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-xs font-bold tracking-widest text-white uppercase" style={{ lineHeight: 1.2 }}>
            Hawkie
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-2xs" style={{ color: 'rgba(155,185,200,0.7)' }}>
              Mission Intelligence
            </span>
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{
                background: ctx.systemStatus.websocket === 'connected' ? '#1F9D68' : '#D98B24',
              }}
            />
            {isDemo && (
              <span
                className="text-2xs font-bold px-1 py-0.5 rounded uppercase tracking-wide"
                style={{ background: 'rgba(217,139,36,0.18)', color: '#D98B24', border: '1px solid rgba(217,139,36,0.3)' }}
              >
                Demo
              </span>
            )}
          </div>
        </div>

        {unacked > 0 && (
          <span
            className="text-2xs font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: '#C62832', color: '#fff' }}
          >
            {unacked}
          </span>
        )}

        {!embedded && onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded transition-colors"
            style={{ color: 'rgba(155,185,200,0.7)' }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#fff')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'rgba(155,185,200,0.7)')}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Offline banner */}
      {offline && (
        <div
          className="flex items-center gap-2 px-3 py-2 text-2xs flex-shrink-0"
          style={{ background: 'rgba(217,139,36,0.12)', borderBottom: '1px solid rgba(217,139,36,0.2)', color: '#B87010' }}
        >
          <WifiOff size={12} />
          Live mission data unavailable. Hawkie is operating with last known state.
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3" style={{ minHeight: 0 }}>
        {messages.length === 0 ? (
          <div className="flex flex-col gap-3">
            <div className="text-center py-4">
              <BrainCircuit size={24} className="mx-auto mb-2" style={{ color: 'rgba(198,40,50,0.4)' }} />
              <p className="text-xs text-text-muted">Ask me anything about your operations.</p>
            </div>
            {/* Suggested questions */}
            {suggested.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="telemetry-label px-1">Suggested</span>
                <div className="flex flex-col gap-1.5">
                  {suggested.map((q) => (
                    <button
                      key={q}
                      onClick={() => onSend(q)}
                      className="text-left text-xs px-3 py-2 rounded-lg transition-colors"
                      style={{
                        background: 'rgba(67,88,99,0.07)',
                        border: '1px solid rgba(67,88,99,0.15)',
                        color: 'rgba(23,35,43,0.8)',
                      }}
                      onMouseEnter={(e) => {
                        const el = e.currentTarget as HTMLElement
                        el.style.background = 'rgba(67,88,99,0.12)'
                        el.style.borderColor = 'rgba(67,88,99,0.25)'
                      }}
                      onMouseLeave={(e) => {
                        const el = e.currentTarget as HTMLElement
                        el.style.background = 'rgba(67,88,99,0.07)'
                        el.style.borderColor = 'rgba(67,88,99,0.15)'
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {msg.role === 'hawkie' && (
                  <div
                    className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5"
                    style={{ background: 'rgba(26,36,44,0.9)', border: '1px solid rgba(198,40,50,0.3)' }}
                  >
                    <BrainCircuit size={11} style={{ color: '#C62832' }} />
                  </div>
                )}
                <div
                  className="flex flex-col max-w-[80%]"
                  style={{ alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}
                >
                  <div
                    className="rounded-xl px-3 py-2 text-xs leading-relaxed"
                    style={
                      msg.role === 'user'
                        ? {
                            background: 'rgba(26,36,44,0.9)',
                            color: 'rgba(220,235,242,0.95)',
                            borderRadius: '12px 12px 2px 12px',
                          }
                        : {
                            background: 'rgba(178,196,207,0.22)',
                            color: 'rgba(23,35,43,0.9)',
                            border: '1px solid rgba(67,88,99,0.12)',
                            borderRadius: '12px 12px 12px 2px',
                          }
                    }
                  >
                    <RichText text={msg.text} />
                  </div>
                  {msg.cards && msg.cards.length > 0 && (
                    <div className="w-full mt-1 flex flex-col gap-1.5">
                      {msg.cards.map((card, i) => (
                        <MessageCard key={i} card={card} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {processing && (
              <div className="flex gap-2 flex-row">
                <div
                  className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5"
                  style={{ background: 'rgba(26,36,44,0.9)', border: '1px solid rgba(198,40,50,0.3)' }}
                >
                  <BrainCircuit size={11} style={{ color: '#C62832' }} />
                </div>
                <ThinkingDots />
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input area */}
      <div
        className="flex items-end gap-2 px-3 py-2.5 flex-shrink-0"
        style={{ borderTop: '1px solid rgba(67,88,99,0.12)' }}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Hawkie…"
          rows={1}
          disabled={processing}
          className="flex-1 resize-none rounded-lg px-3 py-2 text-xs outline-none transition-all"
          style={{
            background: 'rgba(67,88,99,0.08)',
            border: '1px solid rgba(67,88,99,0.18)',
            color: 'rgba(23,35,43,0.9)',
            lineHeight: '1.5',
          }}
          onFocus={(e) => {
            ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(198,40,50,0.35)'
          }}
          onBlur={(e) => {
            ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(67,88,99,0.18)'
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || processing}
          className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all"
          style={{
            background: input.trim() && !processing ? '#C62832' : 'rgba(198,40,50,0.3)',
            color: '#fff',
          }}
        >
          <Send size={13} />
        </button>
      </div>
    </div>
  )
}

// ─── HawkieFloat (exported) ───────────────────────────────────────────────────

export function HawkieFloat({ portal }: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<HawkieMessage[]>([])
  const [processing, setProcessing] = useState(false)
  const storeState = useStore()

  const ctx: HawkieContext = {
    user: storeState.user,
    isDemo: storeState.isDemo,
    orders: storeState.orders,
    drones: storeState.drones,
    activeMission: storeState.activeMission,
    alerts: storeState.alerts,
    systemStatus: storeState.systemStatus,
  }

  const suggested = suggestedQuestions(ctx)
  const unacked = ctx.alerts.filter((a) => !a.acknowledged).length

  const handleSend = useCallback(
    async (text: string) => {
      const userMsg: HawkieMessage = {
        id: `${Date.now()}-u`,
        role: 'user',
        text,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, userMsg].slice(-50))
      setProcessing(true)

      await new Promise((res) => setTimeout(res, 600))

      const result = hawkieAnswer(text, ctx)
      const hawkMsg: HawkieMessage = {
        id: `${Date.now()}-h`,
        role: 'hawkie',
        text: result.text,
        cards: result.cards,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, hawkMsg].slice(-50))
      setProcessing(false)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx]
  )

  const positionClass =
    portal === 'admin' ? 'bottom-6 right-6' : 'bottom-[80px] right-4'

  return (
    <div className={`fixed ${positionClass} z-50 flex flex-col items-end gap-3`}>
      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          >
            <ChatPanel
              onClose={() => setOpen(false)}
              portal={portal}
              ctx={ctx}
              messages={messages}
              processing={processing}
              onSend={handleSend}
              suggested={suggested}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating button */}
      <div className="relative">
        <motion.button
          onClick={() => setOpen((v) => !v)}
          animate={{ scale: [1, 1.04, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          className="w-[52px] h-[52px] rounded-full flex items-center justify-center relative group"
          style={{
            background: 'rgba(26,36,44,0.94)',
            border: '1px solid rgba(198,40,50,0.3)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3), 0 0 0 1px rgba(198,40,50,0.1)',
          }}
        >
          <BrainCircuit size={20} style={{ color: '#C62832' }} />

          {/* Tooltip */}
          <motion.span
            initial={{ opacity: 0, x: 6 }}
            whileHover={{ opacity: 1, x: 0 }}
            className="absolute right-full mr-3 px-2 py-1 rounded text-xs whitespace-nowrap pointer-events-none"
            style={{
              background: 'rgba(26,36,44,0.97)',
              border: '1px solid rgba(255,255,255,0.10)',
              color: 'rgba(220,235,242,0.92)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.28)',
            }}
          >
            Ask Hawkie
          </motion.span>
        </motion.button>

        {/* Unread dot */}
        {unacked > 0 && !open && (
          <span
            className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full"
            style={{ background: '#C62832', border: '2px solid rgba(26,36,44,0.94)' }}
          />
        )}
      </div>
    </div>
  )
}

// Re-export ChatPanel for embedded use in AdminHawkie
export { ChatPanel }
export type { ChatPanelProps }
