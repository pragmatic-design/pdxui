// Config schema — PdxConfig type + defineConfig() helper.

import type { CompilerPlugin } from '@pdxui/compiler';

export interface PdxConfig {
    /** Source root directory. Default: 'src' */
    root?: string;
    /** Route scanning directory. Default: 'src/routes' */
    routes?: string;
    /** Auto-import component directory. Default: 'src/components' */
    components?: string;
    /** Build options. */
    build?: {
        outDir?: string;
        minify?: boolean;
        target?: string;
    };
    /** Compiler plugins. */
    plugins?: CompilerPlugin[];
}

export interface ResolvedConfig {
    root: string;
    routes: string;
    components: string;
    outDir: string;
    minify: boolean;
    target: string;
    plugins: CompilerPlugin[];
    cwd: string;
}

/** Type-safe config helper for pdx.config.ts. */
export function defineConfig(config: PdxConfig): PdxConfig {
    return config;
}
