import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['test/unit/**/*.test.ts'] } },
      { test: { name: 'golden', include: ['test/golden/**/*.test.ts'], testTimeout: 120_000 } },
      { test: { name: 'integration', include: ['test/integration/**/*.test.ts'] } },
      { test: { name: 'e2e', include: ['test/e2e/**/*.test.ts'], testTimeout: 60_000 } },
    ],
  },
})
