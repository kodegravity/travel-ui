import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
    // `vitest run --coverage` writes coverage/lcov.info for SonarQube Cloud.
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/vite-env.d.ts'],
    },
    // Okta's package exports a Node build by default; tests need the browser build.
    alias: {
      '@okta/okta-auth-js': fileURLToPath(new URL('./node_modules/@okta/okta-auth-js/esm/browser/exports/exports/default.js', import.meta.url)),
    },
  },
})
