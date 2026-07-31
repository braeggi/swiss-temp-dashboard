import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'tests/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
    // Default stays 'node' so the ~143 pure tests keep running without a DOM.
    // Component tests opt in per file with `// @vitest-environment jsdom`.
  },
});
