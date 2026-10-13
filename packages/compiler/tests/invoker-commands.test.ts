// Invoker commands in a template (#140): `<button commandfor="d" command="--show">` reaches an
// element with `id="d"` in the same template, and the command is one the target answers — a method a
// library component exposes (from the manifest), or a built-in command its element type has.

import { describe, it, expect } from 'vitest';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { validate } from '../src/compiler/validate';
import { parseTemplate } from '../src/parser/template';
import { ComponentResolver } from '../src/component-resolver';

// pdx-dialog's exposed methods as the manifest lists them.
const METHODS: Record<string, string[]> = { 'pdx-dialog': ['show', 'close', 'toggle'] };
const methodsOf = (tag: string) => METHODS[tag] ?? null;

function codes(template: string, code: string, lookup: typeof methodsOf | undefined = methodsOf) {
    const analysis = analyzeScript('let a = $signal(1);', 'test.pdx');
    return validate(analysis, parseTemplate(template), 'test.pdx', { methodsOf: lookup }).filter(w => w.code === code);
}

const DIALOG = '<pdx-dialog id="d" title="T"><p>x</p></pdx-dialog>';

describe('PDX_COMMAND_UNKNOWN', () => {
    it('a custom command the component does not expose: --open on pdx-dialog', () => {
        const found = codes(`<button commandfor="d" command="--open">Open</button>${DIALOG}`, 'PDX_COMMAND_UNKNOWN');
        expect(found).toHaveLength(1);
        expect(found[0].message).toContain(`'--open'`);
        expect(found[0].message).toContain('show, close, toggle');
    });

    it('the control: --show and --close are pdx-dialog\'s', () => {
        expect(codes(`<button commandfor="d" command="--show">a</button><button commandfor="d" command="--close">b</button>${DIALOG}`, 'PDX_COMMAND_UNKNOWN')).toHaveLength(0);
    });

    it('a component the manifest does not know is not checked', () => {
        expect(codes('<button commandfor="w" command="--anything">a</button><my-widget id="w"></my-widget>', 'PDX_COMMAND_UNKNOWN')).toHaveLength(0);
    });

    it('a built-in command checks the element type: show-modal needs a <dialog>', () => {
        expect(codes('<button commandfor="d" command="show-modal">a</button><dialog id="d"></dialog>', 'PDX_COMMAND_UNKNOWN')).toHaveLength(0);
        expect(codes(`<button commandfor="d" command="show-modal">a</button>${DIALOG}`, 'PDX_COMMAND_UNKNOWN')).toHaveLength(1);
    });

    it('toggle-popover needs a popover target', () => {
        expect(codes('<button commandfor="p" command="toggle-popover">a</button><div id="p" popover>x</div>', 'PDX_COMMAND_UNKNOWN')).toHaveLength(0);
        expect(codes('<button commandfor="p" command="toggle-popover">a</button><div id="p">x</div>', 'PDX_COMMAND_UNKNOWN')).toHaveLength(1);
    });

    it('a command that is neither built-in nor --custom is reported', () => {
        const found = codes(`<button commandfor="d" command="show">a</button>${DIALOG}`, 'PDX_COMMAND_UNKNOWN');
        expect(found).toHaveLength(1);
        expect(found[0].hint).toContain('command="--show"');
    });
});

describe('PDX_COMMAND_TARGET_MISSING', () => {
    it('a commandfor naming no element of the template', () => {
        const found = codes('<button commandfor="missing" command="--show">a</button>', 'PDX_COMMAND_TARGET_MISSING');
        expect(found).toHaveLength(1);
        expect(found[0].message).toContain(`'missing'`);
    });

    it('the control: the target is in the template', () => {
        expect(codes(`<button commandfor="d" command="--show">a</button>${DIALOG}`, 'PDX_COMMAND_TARGET_MISSING')).toHaveLength(0);
    });

    it('with a bound :id in the template, a missing literal id proves nothing', () => {
        expect(codes('<button commandfor="d" command="--show">a</button><pdx-dialog :id="dialogId"></pdx-dialog>', 'PDX_COMMAND_TARGET_MISSING')).toHaveLength(0);
    });
});

describe('the resolver reads the exposed methods from the manifest', () => {
    it('pdx-dialog exposes show and close, as its source does', () => {
        const resolver = new ComponentResolver();
        resolver.registerUiManifest(process.cwd());
        const methods = resolver.methodsOf('pdx-dialog');
        expect(methods && [...methods]).toEqual(expect.arrayContaining(['show', 'close']));
    });
});
