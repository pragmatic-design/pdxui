import { defineConfig } from 'vite';
import { pdx } from '../../src/index';

// Zero config — pdx() auto-discovers @pdxui/* packages in the workspace
export default defineConfig({
    plugins: [pdx({ devtools: false })],
    server: {
        port: 5201,
    },
});
