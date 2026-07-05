import { defineConfig } from 'vitest/config';
import path from 'path';

// Minimal Vitest config for pure-logic unit tests.
// Environment is 'node' because the seeded tests import only pure helper
// functions (no DOM, no Firebase SDK). If a future test needs the DOM,
// switch that file to `// @vitest-environment jsdom` and add jsdom as a dev dep.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Cloud Functions have their own emulator-backed rules tests under
    // functions/test — those are NOT run by Vitest.
    exclude: ['node_modules', 'dist', 'lib', 'functions'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
