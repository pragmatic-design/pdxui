// A runtime error that nothing handles names its component and the .pdx it came from.
//
// In development the compiler registers each component with its file (`component(tag, { file })`).
// An error left unhandled — a setup or render with no boundary around it, an event handler, an
// effect — is reported as `<tag> (file)`, so the console says where to look instead of a bare
// `Uncaught Error`.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { signal, computed } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';
import { component } from '../src/component/component';
import { onGlobalError, clearGlobalErrorHandlers, safeHandler, type ErrorContext } from '../src/component/global-error';

let tagId = 0;
const uniqueTag = () => `error-file-${tagId++}`;
const FILE = 'src/pages/login.pdx';

let errorSpy: ReturnType<typeof vi.spyOn>;

/** Every console.error call, its arguments joined as text. */
function logged(): string[] {
    return (errorSpy.mock.calls as unknown[][]).map(args => args.map(a => (a instanceof Error ? a.message : String(a))).join(' '));
}

beforeEach(() => {
    document.body.innerHTML = '';
    clearGlobalErrorHandlers();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
    clearGlobalErrorHandlers();
    errorSpy.mockRestore();
});

describe('an unhandled runtime error names its component and file', () => {
    it('a render that throws with no boundary: logged with tag and file, then rethrown unchanged', () => {
        const tag = uniqueTag();
        const boom = new Error('render-boom');
        component(tag, { file: FILE, render: () => { throw boom; } });

        let thrown: unknown;
        try {
            document.body.appendChild(document.createElement(tag));
        } catch (err) {
            thrown = err;
        }

        expect(thrown, 'the error no longer leaves connectedCallback as it was').toBe(boom);
        const line = logged().find(l => l.includes('render-boom'));
        expect(line, 'nothing was logged for the render error').toBeDefined();
        expect(line).toContain(`<${tag}> (${FILE})`);
    });

    it('a setup that throws with no boundary: the message names the file', () => {
        const tag = uniqueTag();
        component(tag, { file: FILE, setup: () => { throw new Error('setup-boom'); }, render: () => html`<i></i>` });

        document.body.appendChild(document.createElement(tag));

        expect(logged().find(l => l.includes('setup-boom'))).toContain(`<${tag}> (${FILE})`);
    });

    it('an event handler that throws: the message names the file', () => {
        const tag = uniqueTag();
        component(tag, { file: FILE, render: () => html`<i></i>` });

        safeHandler(() => { throw new Error('click-boom'); }, tag, 'click')();

        expect(logged().find(l => l.includes('click-boom'))).toContain(`<${tag}> (${FILE})`);
    });

    it('an effect inside a component that throws: the global handler is told the component and file', () => {
        const tag = uniqueTag();
        const fail = signal(false);
        const label = computed(() => {
            if (fail()) throw new Error('effect-boom');
            return 'ok';
        });
        component(tag, { file: FILE, render: () => html`<span>${() => label()}</span>` });
        const contexts: ErrorContext[] = [];
        onGlobalError((_err, ctx) => { contexts.push(ctx); });
        document.body.appendChild(document.createElement(tag));

        fail.set(true);

        expect(contexts).toEqual([{ source: 'effect', component: tag, file: FILE }]);
        expect(logged().find(l => l.includes('effect-boom'))).toContain(`<${tag}> (${FILE})`);
    });

    it('control: a component registered without a file is named by its tag alone', () => {
        const tag = uniqueTag();
        component(tag, { render: () => html`<i></i>` });

        safeHandler(() => { throw new Error('plain-boom'); }, tag, 'click')();

        const line = logged().find(l => l.includes('plain-boom'));
        expect(line).toContain(`<${tag}>:`);
        expect(line).not.toContain('(');
    });
});
