// Whether the project's own Vite config already registers the pdx plugin.
//
// `pdx build` and `pdx dev` hand Vite a `pdx()` of their own, and Vite also loads the project's
// vite.config — which `pdx new project` writes with `pdx()` in it. Two `pragmatic-pdx` plugins then
// transform the same module, and the build emits `component("app-root", …)` with `component` bound to
// nothing: a page that throws at load (#197). The CLI adds its plugin only when the config has none.

import type { ConfigEnv, PluginOption } from 'vite';

/** The name the compiler's Vite plugin registers under (packages/compiler/src/plugin.ts). */
export const PDX_PLUGIN_NAME ='pragmatic-pdx';

/** Every plugin in a `plugins` option, arrays flattened and promises awaited; falsy entries dropped. */
async function flatten(option: PluginOption | PluginOption[] | undefined): Promise<{ name?: string }[]> {
    const value = await option;
    if (!value) return [];
    if (Array.isArray(value)) return (await Promise.all(value.map((v) => flatten(v)))).flat();
    return [value as { name?: string }];
}

/**
 * True when the Vite config Vite would load from `root` registers the pdx plugin. False when there is
 * no config file, or it registers none.
 */
export async function configRegistersPdx(vite: typeof import('vite'), root: string, env: ConfigEnv): Promise<boolean> {
    return (await configPluginNames(vite, root, env)).includes(PDX_PLUGIN_NAME);
}

/**
 * The plugin `pdx({ hydrate: true })` adds beside the compiler (packages/compiler/src/hydrate-entry.ts):
 * its presence is how a config says it builds the app to hydrate.
 */
export const PDX_HYDRATE_PLUGIN_NAME = 'pragmatic-pdx-hydrate';

/** The names of the plugins the Vite config Vite would load from `root` registers; none without a file. */
export async function configPluginNames(vite: typeof import('vite'), root: string, env: ConfigEnv): Promise<string[]> {
    const loaded = await vite.loadConfigFromFile(env, undefined, root, 'silent');
    if (!loaded) return [];
    return (await flatten(loaded.config.plugins)).flatMap((p) => (p?.name ? [p.name] : []));
}
