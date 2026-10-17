// A rune module — a `.pdx.ts` — as TypeScript reads it (#467).
//
// A `.pdx.ts` is compiled like a .pdx script: `@store name;` makes it a store module whose export is
// `useName()`, and `$signal` / `$derived` are runes. Read as written, `@store` is no export and the
// file is «not a module» to TypeScript, so every `import { useName }` of it was an error. The service
// reads it projected instead: the script projection a .pdx gets (`projectScript`, offsets kept), and,
// after the source, the hook the compiler emits (`compileStoreMode`): `useName()` returns every name
// of the module, a signal as a signal — `logs()` — and the rest as declared.

import { analyzeScript } from '@pdxui/compiler';
import { projectScript } from './ts-service';

/** `text` (a `.pdx.ts` named `filename`) as TypeScript should read it. */
export function projectRuneModule(text: string, filename: string): string {
    const projected = projectScript(text);
    let analysis: ReturnType<typeof analyzeScript>;
    try { analysis = analyzeScript(text, filename, {}); } catch { return projected; } // mid-edit: no hook rather than a wrong one
    const store = analysis.globalStore;
    if (!store) return projected;
    const hook = `use${store.name.charAt(0).toUpperCase()}${store.name.slice(1)}`;
    const members = analysis.exports.map((e) => {
        if (e.kind === 'signal') return `${e.name}: null! as PdxSignal<typeof ${e.name}>`;
        if (e.kind === 'derived') return `${e.name}: null! as PdxReadonly<typeof ${e.name}>`;
        return e.name;
    });
    return `${projected}\n;export function ${hook}() { return { ${members.join(', ')} }; }\n`;
}
