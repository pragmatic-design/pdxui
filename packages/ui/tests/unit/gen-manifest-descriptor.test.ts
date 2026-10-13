// A component written with the typed descriptor (#123) declares its props and events with the types
// it means: the manifest reads them from there, so the catalogue, the site and an agent see
// `'sm' | 'md'` and `{ pressed: boolean }` instead of `string` and a guess read off the emit calls.

import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs build script, no type declarations by design
import { analyzeFile } from '../../scripts/gen-manifest.mjs';

const SOURCE = [
    "component('pdx-widget', {",
    '    props: {',
    "        /** How big. */",
    "        size: prop<'sm' | 'md'>('md'),",
    '        count: prop(0),',
    '        on: prop(false),',
    '        items: prop<Item[]>(() => []),',
    '        source: prop<DataSource | null>(null),',
    '        max: prop.required<number>({ type: Number }),',
    '        options: prop.required<Option[]>(),',
    '    },',
    '    events: {',
    '        /** Fired when the widget opens. */',
    '        open: event<void>({ bubbles: false }),',
    "        'pdx-change': event<{ value: string }>(),",
    '    },',
    "    setup(ctx) { ctx.emit('open'); ctx.emit('pdx-change', { value: 'x' }); },",
    '    render: () => html`<div></div>`,',
    '});',
].join('\n');

const declaration = () => analyzeFile('src/widget/pdx-widget.ts', SOURCE, {})[0].declarations[0];
const field = (name: string) => declaration().members.find((m: { name: string }) => m.name === name);
const attribute = (name: string) => declaration().attributes.find((a: { fieldName: string }) => a.fieldName === name);

describe('gen-manifest reads a typed descriptor', () => {
    it('a prop\'s type is its type argument, its default the argument', () => {
        expect(field('size')).toMatchObject({ type: { text: "'sm' | 'md'" }, default: "'md'", description: 'How big.' });
    });

    it('a prop with no type argument takes the type its default implies', () => {
        expect(field('count')).toMatchObject({ type: { text: 'number' }, default: '0' });
        expect(field('on')).toMatchObject({ type: { text: 'boolean' }, default: 'false' });
    });

    it('an attribute exists only where the runtime type is one an attribute can set', () => {
        expect(attribute('size')).toBeDefined();
        expect(attribute('max')).toBeDefined();
        // Array and Object props are set as properties: the type argument does not change that.
        expect(attribute('items')).toBeUndefined();
        expect(attribute('source')).toBeUndefined();
        expect(attribute('options')).toBeUndefined();
    });

    it('a required prop has no default', () => {
        expect(field('max')).toMatchObject({ type: { text: 'number' } });
        expect(field('max').default).toBeUndefined();
    });

    it('an event\'s detail is its type argument; a void event has none', () => {
        const events = declaration().events;
        expect(events.find((e: { name: string }) => e.name === 'pdx-change')).toMatchObject({ detail: '{ value: string }' });
        const open = events.find((e: { name: string }) => e.name === 'open');
        expect(open.detail).toBeUndefined();
        expect(open.description).toBe('Fired when the widget opens. Does not bubble.');
    });

    it('each event once, though it is both declared and emitted', () => {
        expect(declaration().events.map((e: { name: string }) => e.name)).toEqual(['open', 'pdx-change']);
    });
});
