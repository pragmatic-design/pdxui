// A re-export of another module in a component script (#1352). The script is the body of `setup(ctx)`,
// where an `export` is PDX_SCRIPT_EXPORT (#551). A library component's entry is its `.pdx`, and four of
// them export values apps import (`DataSourceContext`, `toast`, `dialog`, `ErrorContext`): a
// re-export, `export { X } from './x'`, is a statement of the module, not of the setup, and compiles
// to the same statement at module level. A value the script makes is still made per instance, and its
// export stays PDX_SCRIPT_EXPORT.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { generateDts, scriptImportStatements } from '../src/compiler/dts-generator';

const file = (script: string) => `<template><p>{{ n }}</p></template>\n<script>\n${script}\n</script>\n`;
const run = (script: string) => compile(file(script), 'probe.pdx');
const reported = (script: string) => run(script).warnings.filter((w) => w.code === 'PDX_SCRIPT_EXPORT');
/** The module before `defineComponent(`: its imports and other module-level statements. */
const moduleHead = (code: string): string => code.slice(0, code.indexOf('defineComponent('));
const setupOf = (code: string): string => code.slice(code.indexOf('setup(ctx)'), code.indexOf('render:'));

describe('a re-export in a component script', () => {
    it('is emitted at module level, and is not PDX_SCRIPT_EXPORT', () => {
        const script = "let n = $signal(0);\nexport { DataSourceContext } from './data-source-context';";
        expect(reported(script)).toEqual([]);
        const { code } = run(script);
        expect(moduleHead(code)).toContain("export { DataSourceContext } from './data-source-context';");
        expect(setupOf(code)).not.toMatch(/\bexport\b/);
    });

    it('every re-export form: renamed, several, written on several lines, a namespace', () => {
        const script = [
            'let n = $signal(0);',
            "export { toast as notify, getToastQueue } from './toast-service';",
            'export {',
            '    dialog,',
            '    getDialogQueue,',
            "} from './dialog-service';",
            "export * from './helpers';",
        ].join('\n');
        expect(reported(script)).toEqual([]);
        const head = moduleHead(run(script).code);
        expect(head).toContain("export { toast as notify, getToastQueue } from './toast-service';");
        expect(head).toMatch(/export \{ dialog, getDialogQueue, \} from '\.\/dialog-service';/);
        expect(head).toContain("export * from './helpers';");
    });

    it('the .d.ts re-exports it', () => {
        const script = "export { DataSourceContext } from './data-source-context';\nlet n = $signal(0);";
        const a = analyzeScript(script + '\n', 'probe.pdx');
        const dts = generateDts({ tag: 'pdx-probe', props: a.props, events: a.events, slots: [], imports: scriptImportStatements(script) });
        expect(dts).toContain("export { DataSourceContext } from './data-source-context';");
    });

    it('the control: an export of a value the script makes is still PDX_SCRIPT_EXPORT', () => {
        expect(reported('let n = $signal(0);\nexport const y = 1;')).toHaveLength(1);
        expect(reported('let n = $signal(0);\nconst a = 1;\nexport { a };')).toHaveLength(1);
        // Several lines with no `from`: a local list, reported, and not lifted.
        const multi = 'let n = $signal(0);\nconst a = 1;\nexport {\n    a,\n};';
        expect(reported(multi)).toHaveLength(1);
        expect(moduleHead(run(multi).code)).not.toMatch(/\bexport\b/);
    });
});
