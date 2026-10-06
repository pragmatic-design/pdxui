import { defineConfig } from 'vite';

// The meta-package is five files and 22 lines of re-export, which reads like an argument for having
// no build at all. It is also the package a beginner installs first (`npm i @pdxui/framework`), and
// with `import` pointing at `./src/*.ts` it would ship TypeScript as its RUNTIME entry: fine inside
// a bundler configured to transpile this dependency, broken in plain Node and in a bundler with
// default settings. So it gets a build.
//
// Every `@pdxui/*` is external. Bundling them would give a consumer two copies of core — one
// through `@pdxui/framework` and one through any direct dependency — and two copies of a
// signal graph is not a smaller install, it is a broken one.
export default defineConfig({
    build: {
        lib: {
            entry: {
                index: 'src/index.ts',
                core: 'src/core.ts',
                ui: 'src/ui.ts',
                router: 'src/router.ts',
            },
            formats: ['es'],
            fileName: (_, name) => `${name}.js`,
        },
        minify: false,
        sourcemap: true,
        target: 'es2022',
        rollupOptions: {
            external: ['@pdxui/core', '@pdxui/ui', '@pdxui/router', '@pdxui/design'],
        },
    },
});
