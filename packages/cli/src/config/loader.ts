// Config loader — loads pdx.config.ts via jiti, falls back to conventions.

import { resolve } from 'pathe';
import { existsSync } from 'fs';
import type { PdxConfig, ResolvedConfig } from './schema';
import { logger } from '../utils/logger';

/** A config file that is there and cannot be used. Carries the path and what went wrong. */
export class ConfigLoadError extends Error {
    constructor(readonly path: string, readonly reason: string, options?: { cause?: unknown }) {
        super(`${path}\n  ${reason}\n  Fix the config, or remove the file to build on the defaults.`, options);
        this.name = 'ConfigLoadError';
    }
}

/**
 * Load pdx.config.ts (or .js) from the project root. No file: an empty config, and the conventions
 * apply.
 *
 * A file that exists and does not load THROWS. Caught and turned into `{}`, a config with a syntax
 * error or a broken import would be ignored in silence and the CLI would build with the default
 * root, routes and outDir, plugins dropped, without a word. Commands go through
 * `loadConfigOrExit`, which turns this into one message and exit 1.
 */
export async function loadConfig(cwd: string): Promise<PdxConfig> {
    const configPath = resolve(cwd, 'pdx.config.ts');
    const configPathJs = resolve(cwd, 'pdx.config.js');

    const path = existsSync(configPath) ? configPath : existsSync(configPathJs) ? configPathJs : null;
    if (!path) return {};

    let mod: unknown;
    try {
        const { createJiti } = await import('jiti');
        const jiti = createJiti(cwd);
        mod = await jiti.import(path);
    } catch (e) {
        throw new ConfigLoadError(path, (e as Error)?.message ?? String(e), { cause: e });
    }

    const config = (mod as { default?: unknown })?.default ?? mod;
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
        throw new ConfigLoadError(path, `it must export an object, and exports ${Array.isArray(config) ? 'an array' : typeof config}.`);
    }
    return config as PdxConfig;
}

/**
 * `loadConfig` for a command: a config that cannot be used stops the CLI with the diagnostic,
 * instead of building on defaults the author did not ask for.
 */
export async function loadConfigOrExit(cwd: string): Promise<PdxConfig> {
    try {
        return await loadConfig(cwd);
    } catch (e) {
        if (!(e instanceof ConfigLoadError)) throw e;
        logger.error(`Cannot load the config:\n${e.message}`);
        process.exit(1);
        return {};
    }
}

/**
 * Resolve config with defaults applied. Convention over configuration.
 */
export function resolveConfig(raw: PdxConfig, cwd: string): ResolvedConfig {
    // Convention: use src/ if it exists, otherwise use cwd
    const defaultRoot = existsSync(resolve(cwd, 'src')) ? 'src' : '.';
    return {
        root: resolve(cwd, raw.root ?? defaultRoot),
        routes: resolve(cwd, raw.routes ?? 'src/routes'),
        components: resolve(cwd, raw.components ?? 'src/components'),
        outDir: resolve(cwd, raw.build?.outDir ?? 'dist'),
        minify: raw.build?.minify ?? true,
        target: raw.build?.target ?? 'es2022',
        plugins: raw.plugins ?? [],
        cwd,
    };
}
