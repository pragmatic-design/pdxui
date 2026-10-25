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
    '        hint: prop.optional<string>({ type: String }),',
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

    it('a required prop is marked required, which the compiler reads to check a use (#130)', () => {
        expect(field('max').required).toBe(true);
        expect(field('options').required).toBe(true);
        expect(field('size').required).toBeUndefined();
    });

    it('an optional prop has no default, its options first, and is not required (#130)', () => {
        expect(field('hint')).toMatchObject({ type: { text: 'string' } });
        expect(field('hint').default).toBeUndefined();
        expect(field('hint').required).toBeUndefined();
        expect(attribute('hint')).toBeDefined();
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

describe('gen-manifest reads the descriptor\'s parts (#134)', () => {
    const source = [
        '/**',
        ' * A widget.',
        ' * @csspart popup - The list of options.',
        ' */',
        "component('pdx-widget', {",
        "    parts: ['trigger', 'popup'],",
        '    render: () => html`<div></div>`,',
        '});',
    ].join('\n');

    it('lists them as cssParts, each once, described by @csspart where it says', () => {
        expect(analyzeFile('src/widget/pdx-widget.ts', source, {})[0].declarations[0].cssParts).toEqual([
            { name: 'popup', description: 'The list of options.' },
            { name: 'trigger', description: 'The element reached as `[data-part="trigger"]`.' },
        ]);
    });
});

describe('gen-manifest reads the descriptor\'s models (#124)', () => {
    const source = [
        "component('pdx-widget', {",
        "    props: { label: prop('') },",
        '    models: {',
        '        /** The chosen value. */',
        "        selectedId: model<string | null>(null, { type: String }),",
        '    },',
        '    render: () => html`<div></div>`,',
        '});',
    ].join('\n');
    const decl = () => analyzeFile('src/widget/pdx-widget.ts', source, {})[0].declarations[0];

    it('lists them by name, which is what the compiler reads to check ::x', () => {
        expect(decl().models).toEqual(['selectedId']);
    });

    it('a model is a field and an attribute, like a prop', () => {
        expect(decl().members.find((m: { name: string }) => m.name === 'selectedId'))
            .toMatchObject({ kind: 'field', type: { text: 'string | null' }, default: 'null', description: 'The chosen value.', attribute: 'selectedid' });
    });

    it('its <kebab-name>-change event carries { value: T } and does not bubble', () => {
        expect(decl().events).toEqual([expect.objectContaining({
            name: 'selected-id-change', detail: '{ value: string | null }', description: expect.stringMatching(/Does not bubble\.$/),
        })]);
    });

    it('the control: a component with no models lists none', () => {
        expect(declaration().models).toBeUndefined();
    });
});

describe('gen-manifest reads the alpha events a component no longer emits (#478)', () => {
    const source = [
        '/**',
        ' * A widget.',
        ' * @alphaevent pdx-change',
        ' * @alphaevent change',
        ' * @alphadetail checked $event.detail.value',
        ' * @alphadetail value $event.currentTarget.value',
        ' * @alphacommit pdx-change',
        ' * @alpharename pdx-input query-change',
        ' */',
        "component('pdx-widget', {",
        '    models: { checked: model(false) },',
        '    render: () => html`<div></div>`,',
        '});',
    ].join('\n');
    const decl = () => analyzeFile('src/widget/pdx-widget.ts', source, {})[0].declarations[0];

    it('@alphaevent becomes alphaEvents, in order', () => {
        expect(decl().alphaEvents).toEqual(['pdx-change', 'change']);
    });

    it('@alphadetail becomes alphaDetail: each alpha detail field and its beta source', () => {
        expect(decl().alphaDetail).toEqual({ checked: '$event.detail.value', value: '$event.currentTarget.value' });
    });

    it('@alphacommit becomes alphaCommit: the alpha event that was the commit (#479)', () => {
        expect(decl().alphaCommit).toBe('pdx-change');
    });

    it('@alpharename becomes alphaRename: an alpha event that is now a declared event of another name (#481)', () => {
        expect(decl().alphaRename).toEqual({ 'pdx-input': 'query-change' });
    });

    it('the control: a component that records none lists neither', () => {
        expect(declaration().alphaEvents).toBeUndefined();
        expect(declaration().alphaDetail).toBeUndefined();
        expect(declaration().alphaCommit).toBeUndefined();
        expect(declaration().alphaRename).toBeUndefined();
    });
});

describe('gen-manifest reads the descriptor\'s slots (#491)', () => {
    const source = [
        '/**',
        ' * A widget.',
        ' * @slot item - Renders one entry.',
        ' */',
        "component('pdx-widget', {",
        '    slots: {',
        '        item: slot<(item: { label: string }, index: number) => Node>(),',
        '        footer: slot(),',
        '    },',
        '    render: () => html`<div></div>`,',
        '});',
    ].join('\n');
    const slots = () => analyzeFile('src/widget/pdx-widget.ts', source, {})[0].declarations[0].slots;

    it("a declared slot's signature is its parameter list, what the editor types a snippet from", () => {
        expect(slots()).toContainEqual({ name: 'item', description: 'Renders one entry.', signature: '(item: { label: string }, index: number)' });
    });

    it('a slot declared with no signature takes no arguments', () => {
        expect(slots()).toContainEqual(expect.objectContaining({ name: 'footer', signature: '()' }));
    });

    it('the control: a slot only the JSDoc names has no signature', () => {
        const alpha = source.replace(/ {4}slots: \{[\s\S]*?\n {4}\},\n/, '');
        expect(analyzeFile('src/widget/pdx-widget.ts', alpha, {})[0].declarations[0].slots)
            .toEqual([{ name: 'item', description: 'Renders one entry.' }]);
    });
});

describe('gen-manifest reads the descriptor\'s generics (#651)', () => {
    const source = [
        '/** A list. */',
        "component('pdx-widget', {",
        "    generics: { T: { extends: '{ key: string; label: string }', from: 'items' } },",
        '    props: {',
        '        items: { type: Array, default: [] },',
        "        label: { type: String, default: '' },",
        '    },',
        '    slots: {',
        '        item: slot<(item: T, index: number) => Node>(),',
        '    },',
        '    render: () => html`<div></div>`,',
        '});',
    ].join('\n');
    const decl = (src = source) => analyzeFile('src/widget/pdx-widget.ts', src, {})[0].declarations[0];
    const field = (name: string, src?: string) => decl(src).members.find((m: { name: string }) => m.name === name);

    it('records each type parameter with its constraint, as a .pdx @generic reads', () => {
        expect(decl().generics).toEqual(['T extends { key: string; label: string }']);
    });

    it('types the prop it is inferred from as an array of it, and the slot uses it', () => {
        expect(field('items').type).toEqual({ text: 'T[]' });
        expect(decl().slots).toContainEqual(expect.objectContaining({ name: 'item', signature: '(item: T, index: number)' }));
    });

    it('the control: the other props keep their type, and a descriptor without generics records none', () => {
        expect(field('label').type).toEqual({ text: 'string' });
        const plain = source.replace(/ {4}generics: .*\n/, '');
        expect(decl(plain).generics).toBeUndefined();
        expect(field('items', plain).type).not.toEqual({ text: 'T[]' });
    });
});

describe('gen-manifest reads the descriptor\'s states (#132)', () => {
    const source = [
        '/**',
        ' * A widget.',
        ' * @cssstate open - The list is open.',
        ' */',
        "component('pdx-widget', {",
        "    states: ['open', 'invalid'],",
        '    render: () => html`<div></div>`,',
        '});',
    ].join('\n');

    it('lists them as cssStates, described by @cssstate where it says', () => {
        expect(analyzeFile('src/widget/pdx-widget.ts', source, {})[0].declarations[0].cssStates).toEqual([
            { name: 'open', description: 'The list is open.' },
            { name: 'invalid', description: 'Matched with `:state(invalid)`.' },
        ]);
    });

    it('the control: a component with no states has no cssStates', () => {
        expect(declaration().cssStates).toBeUndefined();
    });
});
