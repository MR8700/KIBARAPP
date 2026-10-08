import type { Config } from 'tailwindcss';
// Tokens issus du design « Kibar Kinetic » (stitch_recruitflow/kibar_kinetic/DESIGN.md)
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: { extend: {
    colors: { primary: '#1d4ed8', 'primary-deep': '#00288e', 'electric-blue': '#2563EB', 'sahel-gold': '#D97706', success: '#059669', error: '#dc2626', ink: '#0F172A', muted: '#64748B', line: '#E2E8F0', subtle: '#F8FAFC' },
    fontFamily: { head: ['Plus Jakarta Sans', 'sans-serif'], body: ['Inter', 'sans-serif'] },
    borderRadius: { xl: '0.875rem', '2xl': '1rem' },
    keyframes: { 'kibar-load': { from: { transform: 'scaleX(0)' }, to: { transform: 'scaleX(1)' } }, pop: { '0%': { transform: 'scale(.6)', opacity: '0' }, '70%': { transform: 'scale(1.06)', opacity: '1' }, '100%': { transform: 'scale(1)' } }, fadeup: { from: { transform: 'translateY(10px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } } },
  } },
} satisfies Config;
