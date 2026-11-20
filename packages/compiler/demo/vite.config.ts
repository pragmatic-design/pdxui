import { defineConfig } from 'vite';
import { pdx } from '../src/index';

export default defineConfig({
    plugins: [pdx()],
    resolve: {
        alias: [
            // `@pdxui/core` alone: a sub-path (`@pdxui/core/boot/theme`, which pdx() imports where a page
            // imports the design themes, #1246) is pdx()'s own alias, from core's exports. A string
            // here matched by prefix and made it `index.ts/boot/theme`.
            { find: /^@pdxui\/core$/, replacement: '../../core/src/index.ts' },
            { find: '@pdxui/ui', replacement: '../../ui/src/index.ts' },
            { find: '@pdxui/router', replacement: '../../router/src/index.ts' },
            { find: '@pdxui/router/outlet', replacement: '../../router/src/outlet.ts' },
        ],
    },
    server: {
        port: 5200,
    },
});
