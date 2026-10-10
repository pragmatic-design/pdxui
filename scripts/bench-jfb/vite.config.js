import { defineConfig } from 'vite';
import { pdx } from '@pdxui/compiler';

export default defineConfig({
  base: '/frameworks/keyed/pdx/dist/',
  plugins: [pdx()],
});
