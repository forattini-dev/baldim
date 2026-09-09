import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Identity onboarding performs real password hashing. Under the shared CI
    // runner, concurrent workspace tests can push a single hash past Vitest's
    // 5 second default and leave the timed-out setup running into the next test.
    testTimeout: 15_000,
  },
});
