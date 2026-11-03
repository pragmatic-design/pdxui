import { defineConfig } from 'vite';
// Relative, as in vite.config.ts beside it.
import { pilotPlugins } from '../../../ui/pilot/plugin';

/**
 * The same page with the pilot's `.pdx` rewrites in place of the TypeScript components (#685;
 * packages/ui/pilot/plugin.ts redirects every import of them). A production build.
 */
export default defineConfig({
    plugins: [pilotPlugins({ devtools: false })],
    build: { target: 'es2022' },
});
