// The pdx plugins `pdx build` hands Vite — none when the project's vite.config registers its own
// (#197: two compile every module twice). With `hydrate`, the app must be built to take over its
// generated pages, and a config that registers pdx() without it would build one that renders over them.

import type { PluginOption } from 'vite';
import type { resolveConfig } from '../config/loader';
import { configPluginNames, PDX_PLUGIN_NAME, PDX_HYDRATE_PLUGIN_NAME } from '../utils/vite-config';

/** A project whose own config cannot be built the way it was asked. */
export class PdxConfigError extends Error {}

/** The plugins for a build of the project at `cwd`; `hydrate` for an app whose pages are generated. */
export async function pdxPluginsFor(
    vite: typeof import('vite'),
    cwd: string,
    resolved: ReturnType<typeof resolveConfig>,
    hydrate: boolean,
    /** The config file to read instead of the one Vite finds at `cwd`. */
    configFile?: string,
): Promise<PluginOption[]> {
    const names = await configPluginNames(vite, cwd, { command: 'build', mode: 'production' }, configFile);
    if (names.includes(PDX_PLUGIN_NAME)) {
        if (hydrate && !names.includes(PDX_HYDRATE_PLUGIN_NAME)) {
            throw new PdxConfigError('the project\'s vite.config registers pdx() without hydrate: a generated page would be rendered over, not taken over. Use pdx({ hydrate: true }) there.');
        }
        return [];
    }
    const { pdx } = await import('@pdxui/compiler');
    return [pdx({ plugins: resolved.plugins, minify: true, components: [resolved.components], prefix: resolved.prefix, hydrate })];
}
