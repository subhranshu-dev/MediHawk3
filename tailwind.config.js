/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Platinum environment (remapped from old dark names) ──
        obsidian:  '#F4F3EF',   // was #08090C — now platinum bg
        graphite:  '#ECEBE6',   // was #0F1117 — now secondary surface
        charcoal:  '#FAFAF7',   // was #161921 — now elevated surface
        slate:     '#F0EEE7',   // was #1E2230 — now surface-2 / input bg
        panel:     '#EFEDE6',   // was #242838 — now panel
        elevated:  '#FFFFFF',   // was #2C3045 — now pure white elevated

        // ── Ink system (replaces old white/opacity borders) ──
        ink: '#17191C',

        // ── Explicit platinum tokens ──
        platinum: {
          DEFAULT: '#F4F3EF',
          50:  '#FDFCFA',
          100: '#FAF9F5',
          200: '#F4F3EF',
          300: '#ECEBE6',
          400: '#E6E4DD',
          500: '#DDDBD2',
          600: '#D4D1C7',
          700: '#C8C6BC',
        },
        ivory: '#FAFAF7',

        // ── Text system ──
        'text-primary':   '#17191C',
        'text-secondary': '#52566B',
        'text-muted':     '#8E9298',

        // ── Medical crimson ──
        crimson: {
          DEFAULT: '#D71920',
          light:   '#E53535',
          dark:    '#A90F17',
          deep:    '#7D0A10',
          glow:    'rgba(215,25,32,0.10)',
        },

        // ── Safety green ──
        'med-green': {
          DEFAULT: '#1A9E5F',
          light:   '#20C878',
          dark:    '#158450',
          glow:    'rgba(26,158,95,0.10)',
        },

        // ── Operational amber/orange ──
        amber: {
          DEFAULT: '#E06B10',
          light:   '#F59932',
          dark:    '#B85700',
          glow:    'rgba(224,107,16,0.10)',
        },

        // ── Metallic accents ──
        metal: {
          100: '#8E9298',
          200: '#6E7280',
          300: '#52566B',
          400: '#383C4E',
          500: '#252832',
        },
      },

      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        mono:    ['Space Mono', 'JetBrains Mono', 'monospace'],
        display: ['Inter', 'system-ui', 'sans-serif'],
      },

      fontSize: {
        '2xs': ['0.65rem', { lineHeight: '1rem' }],
      },

      backgroundImage: {
        // NO grid backgrounds
        'mh-radial-crimson': 'radial-gradient(ellipse at 50% 0%, rgba(215,25,32,0.06) 0%, transparent 65%)',
        'mh-radial-green':   'radial-gradient(ellipse at 100% 100%, rgba(26,158,95,0.04) 0%, transparent 60%)',
        'mh-radial-warm':    'radial-gradient(ellipse at 30% 60%, rgba(244,243,239,0.9) 0%, transparent 70%)',
      },

      boxShadow: {
        'inner-subtle': 'inset 0 1px 0 0 rgba(255,255,255,0.6)',
        'inner-top':    'inset 0 1px 0 0 rgba(23,25,28,0.04)',
        'sm-ink':    '0 1px 3px rgba(23,25,28,0.08), 0 1px 2px rgba(23,25,28,0.05)',
        'md-ink':    '0 4px 12px rgba(23,25,28,0.10), 0 2px 4px rgba(23,25,28,0.06)',
        'lg-ink':    '0 8px 24px rgba(23,25,28,0.12), 0 4px 8px rgba(23,25,28,0.07)',
        'crimson':   '0 4px 16px rgba(215,25,32,0.20)',
        'green':     '0 4px 16px rgba(26,158,95,0.20)',
      },

      animation: {
        'pulse-slow':   'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float':        'float 6s ease-in-out infinite',
        'rotate-slow':  'spin 20s linear infinite',
        'ping-slow':    'ping 3s cubic-bezier(0, 0, 0.2, 1) infinite',
        'atmo-drift':   'atmo-drift 22s ease-in-out infinite',
        'atmo-pulse':   'atmo-pulse 8s ease-in-out infinite',
        'crimson-breath': 'crimson-breath 6s ease-in-out infinite',
        'signal-travel': 'signal-travel 3.5s ease-in-out infinite',
      },

      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px) rotate(0deg)' },
          '50%':       { transform: 'translateY(-8px) rotate(1deg)' },
        },
      },
    },
  },
  plugins: [],
}
