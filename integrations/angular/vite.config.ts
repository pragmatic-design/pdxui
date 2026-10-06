import { defineConfig } from 'vite';

// Plain Vite: esbuild transpiles TS (experimentalDecorators from tsconfig).
// Angular runs in JIT mode (main.ts imports @angular/compiler), so no special
// Angular build plugin is needed — the components' @Component templates are
// compiled at runtime.
export default defineConfig({
  server: { port: 5403 },
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        useDefineForClassFields: false,
      },
    },
  },
});
