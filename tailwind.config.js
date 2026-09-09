/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Surgical blue-gray environment ──────────────────────────
        obsidian:  '#C8D8E2',   // primary bg (deeper mid-tone)
        graphite:  '#C4D4DD',   // secondary surface
        charcoal:  '#EDF2F5',   // elevated surface (pearl)
        slate:     '#D0DCE4',   // input bg / surface-2
        panel:     '#D0DEEA',   // panel bg
        elevated:  '#F4F7F9',   // near-white elevated

        // ── Ink (dark text/borders on light bg) ──────────────────────
        ink: '#17232B',

        // ── Surgical blue — the distinctive medical-aerospace accent ──
        'surgical-blue': {
          DEFAULT: '#486A7A',
          light:   '#5E7F8E',
          muted:   '#7594A1',
          soft:    '#A8C0C9',
          glow:    'rgba(72,106,122,0.10)',
        },

        // ── Deep graphite — aerospace structure ───────────────────────
        'graphite-deep': {
          DEFAULT: '#26343D',
          mid:     '#34444D',
          soft:    '#3E5260',
          hover:   '#445A67',
        },

        // ── Platinum scale (kept for compatibility) ───────────────────
        platinum: {
          DEFAULT: '#C8D8E2',
          50:  '#EDF2F5',
          100: '#DDE8EE',
          200: '#C8D8E2',
          300: '#BFCFD9',
          400: '#B2C4CF',
          500: '#A4B8C7',
          600: '#96AAB8',
          700: '#869CAD',
        },
        ivory: '#EDF2F5',

        // ── Text system ───────────────────────────────────────────────
        'text-primary':   '#17232B',
        'text-secondary': '#4A6070',
        'text-muted':     '#6E8899',

        // ── Medical crimson ───────────────────────────────────────────
        crimson: {
          DEFAULT: '#C62832',
          light:   '#D62839',
          dark:    '#A91F2A',
          deep:    '#7D1520',
          glow:    'rgba(198,40,50,0.10)',
        },

        // ── Safety green ──────────────────────────────────────────────
        'med-green': {
          DEFAULT: '#1F9D68',
          light:   '#22B87A',
          dark:    '#187A52',
          glow:    'rgba(31,157,104,0.10)',
        },

        // ── Warning amber ─────────────────────────────────────────────
        amber: {
          DEFAULT: '#D98B24',
          light:   '#F5A833',
          dark:    '#B87010',
          glow:    'rgba(217,139,36,0.10)',
        },

        // ── Info steel ────────────────────────────────────────────────
        info: {
          DEFAULT: '#55798A',
          light:   '#6A90A2',
          dark:    '#3E5C6C',
        },

        // ── Metal scale ───────────────────────────────────────────────
        metal: {
          100: '#8EA5B0',
          200: '#6E8895',
          300: '#53636D',
          400: '#384552',
          500: '#253340',
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
        'mh-radial-crimson':  'radial-gradient(ellipse at 50% 0%, rgba(198,40,50,0.06) 0%, transparent 65%)',
        'mh-radial-green':    'radial-gradient(ellipse at 100% 100%, rgba(31,157,104,0.04) 0%, transparent 60%)',
        'mh-radial-surgical': 'radial-gradient(ellipse at 20% 40%, rgba(72,106,122,0.14) 0%, transparent 65%)',
        'mh-radial-cool':     'radial-gradient(ellipse at 80% 10%, rgba(180,210,225,0.28) 0%, transparent 60%)',
      },

      boxShadow: {
        'inner-subtle':  'inset 0 1px 0 0 rgba(255,255,255,0.65)',
        'inner-top':     'inset 0 1px 0 0 rgba(255,255,255,0.50)',
        'sm-ink':  '0 2px 8px rgba(45,65,75,0.08), 0 1px 3px rgba(45,65,75,0.04)',
        'md-ink':  '0 8px 28px rgba(45,65,75,0.10), 0 3px 8px rgba(45,65,75,0.06)',
        'lg-ink':  '0 20px 56px rgba(45,65,75,0.12), 0 8px 20px rgba(45,65,75,0.07)',
        'panel':   '0 6px 24px rgba(45,65,75,0.08), 0 2px 6px rgba(45,65,75,0.05), inset 0 1px 0 rgba(255,255,255,0.68)',
        'panel-hover': '0 18px 52px rgba(45,65,75,0.13), 0 6px 16px rgba(45,65,75,0.08), inset 0 1px 0 rgba(255,255,255,0.78)',
        'panel-elevated': '0 12px 40px rgba(45,65,75,0.10), 0 4px 12px rgba(45,65,75,0.06), inset 0 1px 0 rgba(255,255,255,0.75)',
        'crimson': '0 4px 16px rgba(198,40,50,0.22)',
        'green':   '0 4px 16px rgba(31,157,104,0.22)',
        'surgical':'0 4px 16px rgba(72,106,122,0.18)',
      },

      animation: {
        'pulse-slow':      'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float':           'float 6s ease-in-out infinite',
        'rotate-slow':     'spin 20s linear infinite',
        'ping-slow':       'ping 3s cubic-bezier(0, 0, 0.2, 1) infinite',
        'atmo-drift':      'atmo-drift 22s ease-in-out infinite',
        'atmo-pulse':      'atmo-pulse 8s ease-in-out infinite',
        'crimson-breath':  'crimson-breath 7s ease-in-out infinite',
        'signal-travel':   'signal-travel 3.5s ease-in-out infinite',
        'surgical-shift':  'surgical-shift 18s ease-in-out infinite',
      },

      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px) rotate(0deg)' },
          '50%':       { transform: 'translateY(-8px) rotate(1deg)' },
        },
        'surgical-shift': {
          '0%, 100%': { opacity: '0.55', transform: 'scale(1)' },
          '50%':       { opacity: '0.80', transform: 'scale(1.06)' },
        },
      },
    },
  },
  plugins: [],
}
