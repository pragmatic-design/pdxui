// pdx-rating emits `pdx-change`, the value event of this library.
//
// With only `change`, `<pdx-rating @pdx-change="…">` never fires and anything wired to the library's
// value event — a form binding, an app listening the way it listens to every other control — never
// hears a rating. `pdx-segmented` emits both too.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, mount, tick } from './helpers';
import '../../src/rating/pdx-rating';

type Seen = { type: string; value: unknown }[];
function record(el: HTMLElement): Seen {
    const seen: Seen = [];
    for (const type of ['pdx-change', 'change']) {
        el.addEventListener(type, (e) => seen.push({ type, value: (e as CustomEvent).detail?.value }));
    }
    return seen;
}
const stars = (el: HTMLElement) => [...el.querySelectorAll('.pdx-rating-star')] as HTMLElement[];

describe('pdx-rating: the value event', () => {
    beforeEach(cleanup);

    it('a click emits pdx-change with the new value, and change after it', async () => {
        const el = await mount('pdx-rating', { value: '0' });
        await tick(30);
        const seen = record(el);
        stars(el)[2].click();
        await tick();
        expect(seen, 'a click is one pdx-change and one change, same value').toEqual([
            { type: 'pdx-change', value: 3 },
            { type: 'change', value: 3 },
        ]);
    });

    it('a keyboard change emits both', async () => {
        const el = await mount('pdx-rating', { value: '2' });
        await tick(30);
        const seen = record(el);
        el.querySelector('[role="slider"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
        await tick();
        expect(seen.map(s => s.type)).toEqual(['pdx-change', 'change']);
        expect(seen[0].value).toBe(3);
    });

    it('clear() emits both, with 0', async () => {
        const el = await mount('pdx-rating', { value: '4' });
        await tick(30);
        const seen = record(el);
        (el as unknown as { clear(): void }).clear();
        await tick();
        expect(seen).toEqual([
            { type: 'pdx-change', value: 0 },
            { type: 'change', value: 0 },
        ]);
    });
});

// The library's value event is `pdx-change`. `change` survives where it was already public, as a
// deprecated alias — but never alone, or `@pdx-change` hears nothing.
describe('no component emits a bare change', () => {
    const SRC = join(__dirname, '..', '..', 'src');
    function tsFiles(dir: string): string[] {
        return readdirSync(dir).flatMap((name) => {
            const path = join(dir, name);
            return statSync(path).isDirectory() ? tsFiles(path) : (name.endsWith('.ts') ? [path] : []);
        });
    }

    it('every file that emits `change` emits `pdx-change` too', () => {
        const bare: string[] = [];
        for (const file of tsFiles(SRC)) {
            const src = readFileSync(file, 'utf8');
            if (!src.includes("emit('change'")) continue;
            if (!src.includes("emit('pdx-change'")) bare.push(file.slice(SRC.length + 1).replace(/\\/g, '/'));
        }
        expect(bare, 'these emit change and nothing a pdx-change listener hears').toEqual([]);
    });

    it('the scan reads the sources — the control', () => {
        expect(tsFiles(SRC).length).toBeGreaterThan(100);
        expect(readFileSync(join(SRC, 'rating', 'pdx-rating.ts'), 'utf8')).toContain("emit('change'");
    });
});
