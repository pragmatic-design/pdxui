import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// `isCustomElement` tells the Vue compiler to treat <pdx-*> as native custom
// elements (don't try to resolve them as Vue components).
export default defineConfig({
  plugins: [
    vue({ template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('pdx-') } } }),
  ],
  server: { port: 5401 },
});
