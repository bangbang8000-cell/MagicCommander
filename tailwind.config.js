/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 语义色（契约值：docs/双端设计Token契约_v1.0_2026-08-29.md）
        primary: {
          50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd',
          400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8',
          800: '#1e40af', 900: '#1e3a8a',
          DEFAULT: '#2f6fed',
          hover: '#1e5bc9',
        },
        gray: {
          50: '#f9fafb', 100: '#f3f4f6', 200: '#e5e7eb', 300: '#d1d5db',
          400: '#9ca3af', 500: '#6b7280', 600: '#4b5563', 700: '#374151',
          800: '#1f2937', 900: '#111827',
        },
        // 语义化颜色
        success: {
          50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac',
          400: '#4ade80', 500: '#22c55e', 600: '#16a34a', 700: '#15803d',
          DEFAULT: '#16a34a',
        },
        warning: {
          50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d',
          400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309',
          DEFAULT: '#f59e0b',
        },
        danger: {
          50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 300: '#fca5a5',
          400: '#f87171', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c',
          DEFAULT: '#dc2626',
        },
        info: {
          50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd',
          400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8',
          DEFAULT: '#0ea5e9',
        },
        // 中性色 / Surface（单源：src/styles/tokens.css，light/dark 由 CSS 变量切换）
        app: {
          DEFAULT: 'var(--color-app)',
          surface: 'var(--color-app-surface)',
          hover: 'var(--color-app-hover)',
        },
        edge: {
          subtle: 'var(--color-edge-subtle)',
        },
        text: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          muted: 'var(--color-text-muted)',
        },
        // 焦点环（契约 token，4.1 F1-2 高对比下加宽加深）
        focus: 'var(--color-focus-ring)',
      },
      fontFamily: {
        // 契约 font.sans（双端统一系统 UI 字体栈）
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Microsoft YaHei', 'sans-serif'],
        // 契约 font.mono
        mono: ['"JetBrains Mono"', '"Cascadia Code"', 'Consolas', 'monospace'],
      },
      fontSize: {
        // 标题层级
        'h1': ['1.5rem', { lineHeight: '2rem', fontWeight: '700' }],
        'h2': ['1.25rem', { lineHeight: '1.75rem', fontWeight: '600' }],
        'h3': ['1.125rem', { lineHeight: '1.5rem', fontWeight: '600' }],
        'h4': ['1rem', { lineHeight: '1.5rem', fontWeight: '500' }],
        // 正文层级
        'body': ['0.875rem', { lineHeight: '1.5rem' }],
        'body-sm': ['0.8125rem', { lineHeight: '1.375rem' }],
        'caption': ['0.75rem', { lineHeight: '1.25rem' }],
        'tiny': ['0.625rem', { lineHeight: '1rem' }],
        // 辅助小字号（与 AL 对齐）
        '2xs': ['0.6875rem', { lineHeight: '0.9375rem' }],
        '3xs': ['0.625rem', { lineHeight: '0.8125rem' }],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-in': 'slideIn 0.2s ease-out',
        'scale-in': 'scaleIn 0.15s ease-out',
      },
      boxShadow: {
        // 契约 shadow token（docs/双端设计Token契约_v1.0_2026-08-29.md §4）
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideIn: { '0%': { transform: 'translateY(-8px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        scaleIn: { '0%': { opacity: '0', transform: 'scale(0.95)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
      },
    },
  },
  plugins: [],
}
