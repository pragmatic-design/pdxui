// The pilot (#137): the Vite plugins that put the .pdx rewrites in place of the TypeScript components.
//
// Shared by the pilot's unit run (vitest.pilot.config.ts) and its certification run (the scenario
// server with PDX_PILOT=1), so that both measure the same substitution.
//
// The redirect works on the RESOLVED module, not on an import string, so every import of a piloted
// component reaches the .pdx: a test's `../../src/switch-toggle/pdx-switch`, a sibling component's
// `../switch-toggle/pdx-switch` and a scenario page's aliased `@pdxui/ui/switch` alike. pdx() compiles
// the .pdx files with the library's prefix, so `switch.pdx` registers `<pdx-switch>`.
import type { Plugin } from 'vite';
import { resolve } from 'node:path';
import { pdx } from '../../compiler/src/index';

const here = (p: string) => resolve(__dirname, '..', p).replace(/\\/g, '/');

/** TypeScript component → its .pdx rewrite. */
export const PILOT: Record<string, string> = {
    [here('src/switch-toggle/pdx-switch.ts')]: here('pilot/switch.pdx'),
    [here('src/select/pdx-select.ts')]: here('pilot/select.pdx'),
    [here('src/shared/filter-popover.ts')]: here('pilot/filter-popover.ts'),
};

/** Redirects each piloted module, however it is imported, to its .pdx. */
function pilotRedirect(): Plugin {
    return {
        name: 'pdx-pilot-redirect',
        enforce: 'pre',
        async resolveId(source, importer, options) {
            // No importer: the browser asking for a URL the import analysis has already written. It
            // names the module it means, and redirecting it again would serve the rewrite at the
            // original's URL, which the rewrite imports.
            if (!importer) return null;
            const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
            const target = resolved && PILOT[resolved.id.replace(/\\/g, '/').replace(/\?.*$/, '')];
            // A rewrite that re-exports the module it replaces reaches the original.
            if (!target || target === importer?.replace(/\\/g, '/').replace(/\?.*$/, '')) return null;
            return target;
        },
    };
}

/** The redirect, and the compiler for the .pdx it redirects to. */
export function pilotPlugins(): Plugin[] {
    return [pilotRedirect(), ...pdx({ prefix: 'pdx' })];
}
