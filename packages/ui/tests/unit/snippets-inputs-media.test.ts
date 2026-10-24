// Typed snippets for the carousel, the field list, the upload, the mention and the tag input (#596,
// part 3c of #131).
//
// Each of these components drew the template a parent gave it through a light-DOM scoped slot only
// (`<slot name="x" let:row>`, `ctx.__slots`). It now declares the slot in its descriptor,
// `slot<(…) => Node>()`, so a parent's `@snippet` — which compiles to setting the element's property
// — reaches it. For each one, the same text is drawn once by a snippet from its arguments and once by
// the alpha scoped slot from its scope: the two must render the same entries, and the scoped slot
// must keep working until #131's removal part.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createForm } from '@pdxui/core';
import { cleanup, tick } from './helpers';
import '../../src/carousel/pdx-carousel';
import '../../src/field-list/pdx-field-list';
import '../../src/file-upload/pdx-file-upload';
import '../../src/mention/pdx-mention';
import '../../src/tag-input/pdx-tag-input';

type Scope = Record<string, unknown>;
type Args = unknown[];

interface Case {
    tag: string;
    slot: string;
    /** Props set before the element is connected; a function, for values made fresh per mount. */
    props: () => Record<string, unknown>;
    /** What makes the component draw its entries. */
    open?(el: HTMLElement): Promise<void> | void;
    fromScope(scope: Scope): string;
    fromArgs(...args: Args): string;
}

const field = (x: unknown, name: string) => (x as Scope)[name] as string;

const CASES: Case[] = [
    {
        tag: 'pdx-carousel', slot: 'slide',
        props: () => ({ items: [{ caption: 'First' }, { caption: 'Second' }], loop: false }),
        fromScope: (s) => `${field(s.slide, 'caption')}#${s.index}${s.isActive ? '*' : ''}`,
        fromArgs: (slide, index, active) => `${field(slide, 'caption')}#${index}${active ? '*' : ''}`,
    },
    {
        tag: 'pdx-field-list', slot: 'row',
        props: () => ({
            name: 'tags',
            form: createForm({ initialValues: { tags: [{ name: 'alpha' }, { name: 'beta' }] } }),
            itemFields: [{ name: 'name', type: 'text', label: 'Name' }],
        }),
        fromScope: (s) => `${field(s.item, 'name')}#${s.index}:${typeof s.remove}`,
        fromArgs: (item, index, remove) => `${field(item, 'name')}#${index}:${typeof remove}`,
    },
    {
        tag: 'pdx-file-upload', slot: 'file',
        props: () => ({ multiple: true, value: [new File(['x'], 'a.txt'), new File(['yy'], 'b.txt')] }),
        fromScope: (s) => `${(s.file as File).name}:${s.status}:${s.progress}`,
        fromArgs: (file, status, progress) => `${(file as File).name}:${status}:${progress}`,
    },
    {
        tag: 'pdx-mention', slot: 'suggestion',
        props: () => ({ items: [{ value: 'alice', label: 'Alice' }, { value: 'albert', label: 'Albert' }, { value: 'bob', label: 'Bob' }] }),
        async open(el) {
            const ta = el.querySelector('textarea') as HTMLTextAreaElement;
            ta.focus();
            ta.value = 'Hi @al';
            ta.selectionStart = ta.selectionEnd = ta.value.length;
            ta.dispatchEvent(new Event('input', { bubbles: true }));
        },
        fromScope: (s) => `${field(s.item, 'label')}#${s.index}${s.active ? '*' : ''}`,
        fromArgs: (item, index, active) => `${field(item, 'label')}#${index}${active ? '*' : ''}`,
    },
    {
        tag: 'pdx-tag-input', slot: 'tag',
        props: () => ({ value: ['red', 'blue'] }),
        fromScope: (s) => `${s.tag}#${s.index}`,
        fromArgs: (tag, index) => `${tag}#${index}`,
    },
];

function mark(text: string): Node {
    const span = document.createElement('span');
    span.className = 'mine';
    span.textContent = text;
    return span;
}

async function mount(c: Case, give: (el: HTMLElement) => void): Promise<string[]> {
    const el = document.createElement(c.tag);
    for (const [k, v] of Object.entries(c.props())) (el as unknown as Record<string, unknown>)[k] = v;
    give(el);
    document.body.appendChild(el);
    await tick(50);
    if (c.open) { await c.open(el); await tick(50); }
    return [...document.querySelectorAll('.mine')].map((n) => n.textContent ?? '');
}

/** The alpha scoped slot: what compiled parent code hands a component for `<slot name="x" let:…>`. */
function scopedSlot(c: Case) {
    return (el: HTMLElement) => {
        const carrier = document.createElement('template') as HTMLTemplateElement & {
            __pdxSlot?: (scope: Scope) => Node;
            __pdxSlotName?: string;
        };
        carrier.__pdxSlotName = c.slot;
        carrier.__pdxSlot = (scope) => mark(c.fromScope(scope));
        el.appendChild(carrier);
    };
}

/** The snippet: the element's property, which is what a parent's `@snippet` compiles to setting. */
function snippet(c: Case) {
    return (el: HTMLElement) => {
        (el as unknown as Record<string, unknown>)[c.slot] = (...args: Args) => mark(c.fromArgs(...args));
    };
}

describe('carousel, field list, upload, mention, tag input: a snippet renders where the scoped slot did (#596)', () => {
    beforeEach(cleanup);

    for (const c of CASES) {
        describe(`${c.tag} — ${c.slot}`, () => {
            it('the alpha scoped slot still renders (control)', async () => {
                expect(await mount(c, scopedSlot(c))).not.toEqual([]);
            });

            it('a snippet renders the same entries, from its arguments', async () => {
                const fromSlot = await mount(c, scopedSlot(c));
                cleanup();
                expect(await mount(c, snippet(c))).toEqual(fromSlot);
            });
        });
    }

    it("pdx-field-list: the snippet's remove() removes its row", async () => {
        const form = createForm({ initialValues: { tags: [{ name: 'alpha' }, { name: 'beta' }, { name: 'gamma' }] } });
        const list = document.createElement('pdx-field-list') as HTMLElement & Record<string, unknown>;
        Object.assign(list, { name: 'tags', form, itemFields: [{ name: 'name', type: 'text', label: 'Name' }] });
        list.row = (item: Scope, _index: number, remove: () => void) => {
            const b = document.createElement('button');
            b.className = 'mine';
            b.textContent = String(item.name);
            b.addEventListener('click', remove);
            return b;
        };
        document.body.appendChild(list);
        await vi.waitFor(() => expect(list.querySelectorAll('.mine')).toHaveLength(3));
        (list.querySelectorAll('.mine')[1] as HTMLButtonElement).click();
        await vi.waitFor(() => expect([...list.querySelectorAll('.mine')].map((n) => n.textContent)).toEqual(['alpha', 'gamma']));
    });
});
