// pdx-rating announces its value with its model's event, `value-change` (#480).
//
// It emitted `pdx-change` and `change`, the alpha value event and its alias. Its value is now a model:
// a click, a key or `clear()` writes it, and the write dispatches `value-change` with `{ value }` —
// alone, so a listener hears each change once.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, mount, tick } from './helpers';
import '../../src/rating/pdx-rating';

type Seen = { type: string; value: unknown }[];
function record(el: HTMLElement): Seen {
    const seen: Seen = [];
    for (const type of ['value-change', 'pdx-change', 'change']) {
        el.addEventListener(type, (e) => { if (e instanceof CustomEvent) seen.push({ type, value: e.detail?.value }); });
    }
    return seen;
}
const stars = (el: HTMLElement) => [...el.querySelectorAll('.pdx-rating-star')] as HTMLElement[];

describe('pdx-rating: the value event', () => {
    beforeEach(cleanup);

    it('a click announces value-change with the new value, and nothing else', async () => {
        const el = await mount('pdx-rating', { value: '0' });
        await tick(30);
        const seen = record(el);
        stars(el)[2].click();
        await tick();
        expect(seen).toEqual([{ type: 'value-change', value: 3 }]);
    });

    it('a keyboard change too', async () => {
        const el = await mount('pdx-rating', { value: '2' });
        await tick(30);
        const seen = record(el);
        el.querySelector('[role="slider"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
        await tick();
        expect(seen).toEqual([{ type: 'value-change', value: 3 }]);
    });

    it('clear() too, with 0', async () => {
        const el = await mount('pdx-rating', { value: '4' });
        await tick(30);
        const seen = record(el);
        (el as unknown as { clear(): void }).clear();
        await tick();
        expect(seen).toEqual([{ type: 'value-change', value: 0 }]);
    });
});

// `change` was the alpha alias of the value event; the beta removes it (`components.md` → «@model»).
// A component that emitted it would answer a listener the migration flags as one for the native event.
describe('no component emits change', () => {
    const SRC = join(__dirname, '..', '..', 'src');
    function tsFiles(dir: string): string[] {
        return readdirSync(dir).flatMap((name) => {
            const path = join(dir, name);
            return statSync(path).isDirectory() ? tsFiles(path) : (name.endsWith('.ts') ? [path] : []);
        });
    }

    it('no source calls emit(\'change\')', () => {
        const emitting = tsFiles(SRC)
            .filter((file) => readFileSync(file, 'utf8').includes("emit('change'"))
            .map((file) => file.slice(SRC.length + 1).replace(/\\/g, '/'));
        expect(emitting).toEqual([]);
    });

    it('the scan reads the sources — the control', () => {
        expect(tsFiles(SRC).length).toBeGreaterThan(100);
        expect(readFileSync(join(SRC, 'rating', 'pdx-rating.ts'), 'utf8')).toContain('ctx.value.set(');
    });
});
