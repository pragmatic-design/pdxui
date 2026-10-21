// onControlValue (ui/src/shared/model-event.ts): the value a control announces, on its model's event when
// it declares a model. A control created before its class is defined — pdx-field-list creates its
// controls with `document.createElement` and does not import them — has no model yet to look up; the
// listener waits for the definition (#479). An undefined element dispatches nothing, so nothing is lost.

import { describe, it, expect } from 'vitest';
import { component, html, model } from '@pdxui/core';
import { onControlValue } from '../../src/shared/model-event';
import { tick } from './helpers';

let seq = 0;

describe('onControlValue', () => {
    it('a control defined after the listener is wired is heard on its model\'s event', async () => {
        const tag = `x-late-control-${++seq}`;
        const control = document.createElement(tag);
        document.body.appendChild(control);
        const values: unknown[] = [];
        onControlValue(control, 'pdx-input', (e) => e.detail, (v) => values.push(v));

        component(tag, {
            models: { value: model<string>('') },
            setup(ctx) { ctx.expose({ write: (v: string) => ctx.value.set(v) }); },
            render: () => html`<p>x</p>`,
        });
        await tick();
        (control as HTMLElement & { write(v: string): void }).write('typed');
        expect(values).toEqual(['typed']);
        control.remove();
    });

    it('the teardown before the definition leaves nothing listening', async () => {
        const tag = `x-late-control-${++seq}`;
        const control = document.createElement(tag);
        document.body.appendChild(control);
        const values: unknown[] = [];
        const off = onControlValue(control, 'pdx-input', (e) => e.detail, (v) => values.push(v));
        off();
        component(tag, {
            models: { value: model<string>('') },
            setup(ctx) { ctx.expose({ write: (v: string) => ctx.value.set(v) }); },
            render: () => html`<p>x</p>`,
        });
        await tick();
        (control as HTMLElement & { write(v: string): void }).write('typed');
        expect(values).toEqual([]);
        control.remove();
    });
});
