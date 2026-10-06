import { defineConfig } from 'vite';
import { pdx } from '../src/index';

export default defineConfig({
    plugins: [pdx()],
    resolve: {
        alias: {
            '@pdxui/core': '../../core/src/index.ts',
            '@pdxui/ui': '../../ui/src/index.ts',
            '@pdxui/router': '../../router/src/index.ts',
            '@pdxui/router/outlet': '../../router/src/outlet.ts',
        },
    },
    server: {
        port: 5200,
    },
});
