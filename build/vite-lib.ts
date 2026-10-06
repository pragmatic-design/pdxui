// Shared Vite library build configuration factory.
// Usage in each package: import { createLibConfig } from '../../build/vite-lib';

import { defineConfig, type UserConfig } from 'vite';

interface LibOptions {
    /** Entry point(s). String for single, object for multi-entry. */
    entry: string | Record<string, string>;
    /** IIFE global name (e.g. 'Pragmatic'). Required for IIFE format. */
    name?: string;
    /** Output formats. Default: ['es', 'cjs'] */
    formats?: ('es' | 'cjs' | 'iife')[];
    /** External dependencies (not bundled). */
    external?: (string | RegExp)[];
    /** Enable minification. Default: true */
    minify?: boolean;
    /** Enable .d.ts generation via vite-plugin-dts. Default: true */
    dts?: boolean;
    /** Test environment. Default: undefined (no test config) */
    testEnvironment?: string;
}

/**
 * Create a Vite config for building a library package.
 * Standardizes: sourcemaps, target, formats, dts, test config.
 */
export function createLibConfig(opts: LibOptions): UserConfig {
    const formats = opts.formats ?? ['es', 'cjs'];
    const plugins: any[] = [];

    if (opts.dts !== false) {
        try {
            // Dynamic import to avoid hard dependency
            const dts = require('vite-plugin-dts');
            plugins.push(dts.default?.({ rollupTypes: typeof opts.entry === 'string' }) ?? dts({ rollupTypes: typeof opts.entry === 'string' }));
        } catch {
            // vite-plugin-dts not installed — skip
        }
    }

    const config: UserConfig = {
        plugins,
        build: {
            lib: {
                entry: opts.entry,
                name: opts.name,
                formats,
                fileName: (format, entryName) => {
                    if (format === 'cjs') return `${entryName}.cjs`;
                    if (format === 'iife') return `${entryName}.iife.js`;
                    return `${entryName}.js`;
                },
            },
            minify: opts.minify !== false ? 'esbuild' : false,
            sourcemap: true,
            target: 'es2022',
            rollupOptions: {
                external: opts.external ?? [],
            },
        },
    };

    if (opts.testEnvironment) {
        (config as any).test = {
            environment: opts.testEnvironment,
            include: ['tests/**/*.test.ts'],
        };
    }

    return config;
}
