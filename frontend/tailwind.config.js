/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          500: '#6366f1',
          600: '#4f46e5',
        },
        // Palette V3 - Tables tactiles "Launcher gaming" sombre / neon synthwave
        table: {
          // fonds (degrades de noir/violet profond)
          bg: '#070512', // noir tres profond, leger fond violet
          'bg-soft': '#0F0A24',
          'bg-elev': '#161033', // surface eleve (sidebar, drawer)
          // surfaces glass
          glass: 'rgba(20, 14, 48, 0.55)',
          'glass-soft': 'rgba(20, 14, 48, 0.35)',
          'glass-strong': 'rgba(10, 6, 30, 0.78)',
          'glass-border': 'rgba(255, 255, 255, 0.10)',
          // textes
          ink: '#F5F2FF',
          'ink-soft': '#C9C3E8',
          'ink-muted': '#7E78A6',
          // accents neon (charte conservee)
          violet: '#7B2BFF',
          'violet-soft': '#A664FF',
          'violet-deep': '#3B0A99',
          magenta: '#FF2BD6',
          cyan: '#33E2FF',
          yellow: '#FFE955',
          red: '#FF3B5C',
          mint: '#5ED9A1',
        },
      },
      fontFamily: {
        retro: ['"Press Start 2P"', 'monospace'],
        display: ['"Bebas Neue"', '"Press Start 2P"', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        // degrades reutilisables
        'glow-violet':
          'radial-gradient(circle at 50% 0%, rgba(123, 43, 255, 0.45), transparent 60%)',
        'glow-magenta':
          'radial-gradient(circle at 50% 100%, rgba(255, 43, 214, 0.35), transparent 60%)',
        'fade-bottom':
          'linear-gradient(to bottom, transparent 0%, rgba(7, 5, 18, 0.95) 80%, rgba(7, 5, 18, 1) 100%)',
        'fade-left':
          'linear-gradient(to right, rgba(7, 5, 18, 0.92) 0%, rgba(7, 5, 18, 0.5) 45%, transparent 75%)',
      },
      keyframes: {
        // anims one-shot uniquement (pas d'infinies pour preserver le CPU des mini-PC)
        'soft-pop': {
          '0%': { transform: 'scale(0.96)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'soft-pop': 'soft-pop 0.3s ease-out both',
        'fade-up': 'fade-up 0.5s ease-out both',
      },
      boxShadow: {
        // ombres glow neon - SINGLE LAYER (perf : box-shadow multi-layer = repaint coûteux)
        'neon-violet': '0 6px 20px rgba(123, 43, 255, 0.45)',
        'neon-magenta': '0 6px 20px rgba(255, 43, 214, 0.45)',
        'neon-cyan': '0 6px 20px rgba(51, 226, 255, 0.45)',
        // ombres glass / cards - simplifiees (1 layer + inset leger)
        'glass': '0 8px 24px -6px rgba(0, 0, 0, 0.55)',
        'glass-hover': '0 10px 28px -6px rgba(123, 43, 255, 0.35)',
      },
    },
  },
  plugins: [],
};
