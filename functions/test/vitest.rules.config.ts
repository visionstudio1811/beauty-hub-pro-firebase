import { defineConfig } from 'vitest/config';

// Dedicated Vitest config for the emulator-backed Firestore rules tests.
// Kept separate from the functions build (tsc, include: ["src"]) so these
// tests never enter the deployed bundle and only run when explicitly invoked
// via `firebase emulators:exec` (see functions/test/README.md).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['functions/test/**/*.test.ts'],
    // Rules evaluation over the emulator can be slower than pure unit tests.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
