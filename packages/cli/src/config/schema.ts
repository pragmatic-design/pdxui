// Config schema — PdxConfig type + defineConfig() helper.

import type { CompilerPlugin } from '@pdxui/compiler';

export interface PdxConfig {
    /** Source root directory. Default: 'src' */
    root?: string;
    /** Route scanning directory. Default: 'src/routes' */
    routes?: string;
    /** Auto-import component directory. Default: 'src/components' */
    components?: string;
    /** The app's component tag prefix, as `pdx({ prefix })` (#136). Default: 'app' */
    prefix?: string;
    /** Build options. */
    build?: {
        outDir?: string;
        minify?: boolean;
        target?: string;
    };
    /** Compiler plugins. */
    plugins?: CompilerPlugin[];
    /** Static generation, `pdx build --ssg` (#160). */
    ssg?: {
        /**
         * Paths to generate besides the routes without parameters: one per page wanted for a route
         * like `/posts/:id`, as `/posts/1`.
         */
        routes?: string[];
    };
}

export interface ResolvedConfig {
    root: string;
    routes: string;
    components: string;
    prefix: string;
    outDir: string;
    minify: boolean;
    target: string;
    plugins: CompilerPlugin[];
    /** The paths `ssg.routes` names; [] without. */
    ssgRoutes: string[];
    cwd: string;
}

/** Type-safe config helper for pdx.config.ts. */
export function defineConfig(config: PdxConfig): PdxConfig {
    return config;
}
