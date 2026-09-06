/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Obsidian foundation
        obsidian: '#08090C',
        graphite: '#0F1117',
        charcoal: '#161921',
        slate: '#1E2230',
        panel: '#242838',
        elevated: '#2C3045',
        // Text
        'text-primary': '#EDF0F7',
        'text-secondary': '#8892A8',
        'text-muted': '#4E5668',
        // Accents
        crimson: {
          DEFAULT: '#DC2626',
          light: '#EF4444',
          dark: '#B91C1C',
          glow: 'rgba(220,38,38,0.15)',
        },
        'med-green': {
          DEFAULT: '#16A34A',
          light: '#22C55E',
          dark: '#15803D',
          glow: 'rgba(22,163,74,0.15)',
        },
        amber: {
          DEFAULT: '#D97706',
          light: '#F59E0B',
          dark: '#B45309',
          glow: 'rgba(217,119,6,0.15)',
        },
        // Metallic
        metal: {
          100: '#CBD5E1',
          200: '#94A3B8',
          300: '#64748B',
          400: '#475569',
          500: '#334155',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Space Mono', 'JetBrains Mono', 'monospace'],
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.65rem', { lineHeight: '1rem' }],
      },
      backgroundImage: {
        'grid-subtle': 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
        'scanline': 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
      },
      backgroundSize: {
        'grid-32': '32px 32px',
      },
      boxShadow: {
        'inner-subtle': 'inset 0 1px 0 0 rgba(255,255,255,0.04)',
        'glow-crimson': '0 0 20px rgba(220,38,38,0.25)',
        'glow-green': '0 0 20px rgba(22,163,74,0.25)',
        'glow-amber': '0 0 20px rgba(217,119,6,0.25)',
        'elevation-1': '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
        'elevation-2': '0 4px 12px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.3)',
        'elevation-3': '0 8px 24px rgba(0,0,0,0.6), 0 4px 8px rgba(0,0,0,0.4)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'rotate-slow': 'spin 20s linear infinite',
        'ping-slow': 'ping 3s cubic-bezier(0, 0, 0.2, 1) infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px) rotate(0deg)' },
          '50%': { transform: 'translateY(-8px) rotate(1deg)' },
        },
      },
    },
  },
  plugins: [],
}
