import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the build works from any URL path (e.g. GitHub Pages /repo-name/).
  base: './',
  server: { port: 5183, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        // Large, rarely-changing libraries get their own long-cacheable chunks.
        manualChunks: {
          three: ['three'],
          postprocessing: ['postprocessing'],
        },
      },
    },
    // three.js alone is ~550 kB minified (~140 kB gzipped); that's expected.
    chunkSizeWarningLimit: 650,
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js'],
  },
});
