import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts, whose root is the web app; tests live at the repo root.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
