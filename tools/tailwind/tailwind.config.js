// Tailwind build for the static site. Replaces the Play CDN script so the
// CSP can drop 'unsafe-inline' and cdn.tailwindcss.com from script-src.
// Rebuild after changing classes in any page or asset:
//   cd tools/tailwind && npm ci && npm run build
module.exports = {
  content: [
    '../../**/*.html',
    '../../assets/**/*.js',
    '!../../tools/**',
    '!../../node_modules/**',
    '!../../assets/tailwind.css',
  ],
  // Built at runtime from a template literal in telemetry-flow.js kvGrid().
  safelist: ['sm:grid-cols-1', 'sm:grid-cols-2', 'sm:grid-cols-3', 'sm:grid-cols-4'],
  theme: {
    extend: {
      colors: {
        ink: '#0a0a0a',
        panel: '#111111',
        border: '#262626',
        muted: '#a3a3a3',
        accent: '#00b8ff',
        'accent-dim': '#0091cc',
        good: '#22c55e',
        bad: '#ef4444',
        warn: '#facc15',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
};
