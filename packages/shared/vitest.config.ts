import { defineConfig } from 'vitest/config'

// Pinned west of UTC on purpose. The off-by-one these tests guard against does
// not reproduce on a UTC host, so an unpinned CI box would run the whole suite
// green against the buggy code. index.test.ts asserts the pin actually took
// effect — if this ever stops applying, the suite fails instead of passing
// vacuously. Set on the parent process too, since the test pool forks from it.
process.env.TZ = 'America/Chicago'

export default defineConfig({
  test: {
    env: { TZ: 'America/Chicago' },
    include: ['src/**/*.test.ts'],
  },
})
