// End-to-end smoke tests against the production build, in the locally
// installed Google Chrome (no Playwright browser download needed).
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4180',
    channel: 'chrome',
    viewport: { width: 1280, height: 720 },
    // Headless Chrome needs these for a GPU-less WebGL context.
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] },
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4180 --strictPort',
    port: 4180,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
