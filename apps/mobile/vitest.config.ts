import { defineConfig } from 'vitest/config';

// Pure logic only — no component rendering, matching the precedent apps/api set.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
