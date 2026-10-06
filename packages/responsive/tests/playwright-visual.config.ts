import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './integration/visual-regression',
    timeout: 60_000,
    retries: 0,
    reporter: [['line'], ['html', { open: 'never' }]],
    use: {
        baseURL: 'http://localhost:5210',
        viewport: { width: 1280, height: 800 },
        // Headless Chromium for consistent rendering
        headless: true,
    },
    // Showcase must be running on 5210 — start it before running:
    //   cd packages/compiler/demo/showcase-new && npx vite --port 5210 --force
    // Or use webServer auto-start:
    webServer: {
        command: 'npx vite --port 5210 --force',
        cwd: '../../compiler/demo/showcase-new',
        port: 5210,
        reuseExistingServer: true,
        timeout: 30_000,
    },
    // Screenshot comparison settings
    expect: {
        toHaveScreenshot: {
            maxDiffPixelRatio: 0.02,  // 2% tolerance (font rendering variance)
            animations: 'disabled',
        },
    },
});
