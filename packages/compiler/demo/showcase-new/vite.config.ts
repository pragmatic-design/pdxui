import { defineConfig } from 'vite';
import { pdx } from '../../src/index';

export default defineConfig({
    plugins: [pdx({ devtools: false })],
    server: { port: 5210 },
});
