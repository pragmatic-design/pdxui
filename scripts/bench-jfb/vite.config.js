import { defineConfig } from 'vite';
import { pdx } from '@pdxui/compiler';

export default defineConfig({
  base: '/frameworks/keyed/pdx/dist/',
  plugins: [pdx()],
  // One chunk, nothing to preload: Vite's modulepreload polyfill would only add its bytes (#1246).
  build: { modulePreload: { polyfill: false } },
});
