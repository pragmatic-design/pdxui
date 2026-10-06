import { defineConfig } from 'vite';

export default defineConfig({
    test: {
        include: ['**/*.test.ts'],
        environment: 'happy-dom',
    },
});
