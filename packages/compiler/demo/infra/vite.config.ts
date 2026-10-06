import { defineConfig } from 'vite';
import { resolve } from 'path';
import { pdx } from '../../src/index';

export default defineConfig({
    plugins: [pdx({ devtools: false })],
    server: { port: 5202 },
    build: {
        rollupOptions: {
            input: {
                index: resolve(__dirname, 'index.html'),
                overlay: resolve(__dirname, 'overlay.html'),
                positioning: resolve(__dirname, 'positioning.html'),
                focus: resolve(__dirname, 'focus.html'),
                icons: resolve(__dirname, 'icons.html'),
                container: resolve(__dirname, 'container.html'),
                selection: resolve(__dirname, 'selection.html'),
                virtualizer: resolve(__dirname, 'virtualizer.html'),
                drag: resolve(__dirname, 'drag.html'),
            },
        },
    },
});
