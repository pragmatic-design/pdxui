// The overlay components brought to the beta contract (#288): each announces its open state with
// `open-change` `{ value }` and an `open` custom state, in place of `pdx-open` and `pdx-close`, drives
// it with `show()`, `close()` and `toggle()`, and lists its states and parts in the manifest, which is
// what a theme and an agent's page card read (docs/language/beta/library.md, «Done, for one
// component»). An overlay that closes itself, and has an `open` prop, has it as a model, so `::open`
// follows it. A row joins `DONE` in the pull request that brings its component over.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
type Named = { name: string };
type Member = { kind: string; name: string };
type Decl = { tagName?: string; models?: string[]; cssStates?: Named[]; cssParts?: Named[]; events?: Named[]; members?: Member[] };
const decls = (JSON.parse(readFileSync(join(root, 'custom-elements.json'), 'utf8')) as { modules: { declarations: Decl[] }[] })
    .modules.flatMap((m) => m.declarations);

interface Row {
    tag: string;
    /** `open` where the overlay writes its own `open` prop; none where its open state is a state alone. */
    models: string[];
    states: string[];
    parts: string[];
    /** Its alpha events and methods, now gone. */
    removed: string[];
}

const DONE: Row[] = [
    {
        tag: 'pdx-dialog',
        models: ['open'],
        // `loading` busies the panel; the body's scroll shadows say there is more above or below.
        states: ['open', 'loading', 'scroll-top', 'scroll-bottom'],
        parts: ['root', 'backdrop', 'header', 'close', 'body', 'footer'],
        removed: ['pdx-close'],
    },
    {
        tag: 'pdx-alert-dialog',
        models: ['open'],
        // `loading` holds the confirm back and busies the panel.
        states: ['open', 'loading'],
        // The dialog's panel and sections, its two buttons, and the field a type-to-confirm asks for.
        parts: ['root', 'backdrop', 'header', 'body', 'footer', 'cancel', 'confirm', 'confirm-input'],
        removed: [],
    },
    {
        tag: 'pdx-drawer',
        models: ['open'],
        states: ['open', 'loading'],
        // The panel and its sections, its close button, and the resize handle `resizable` adds.
        parts: ['root', 'backdrop', 'header', 'close', 'body', 'footer', 'resize'],
        removed: ['pdx-close'],
    },
    {
        tag: 'pdx-bottom-sheet',
        models: ['open'],
        // `dragging` while a finger or a pointer moves it: the height follows without a transition.
        states: ['open', 'dragging'],
        // The sheet and its sections, the handle that is its detent slider, and its close button.
        parts: ['root', 'backdrop', 'handle', 'header', 'close', 'body', 'footer'],
        removed: ['pdx-close'],
    },
    {
        tag: 'pdx-popover',
        models: ['open'],
        states: ['open'],
        // The floating panel; the trigger is the page's own element, not the popover's.
        parts: ['root'],
        removed: ['hide'],
    },
    {
        tag: 'pdx-command',
        models: ['open'],
        states: ['open'],
        // The panel and its backdrop, the search combobox, the listbox, a named group, an option, the
        // message when nothing matches, and the keys' footer.
        parts: ['root', 'backdrop', 'input', 'list', 'group', 'option', 'empty', 'footer'],
        removed: ['openPalette', 'closePalette'],
    },
    {
        tag: 'pdx-menu',
        models: ['open'],
        states: ['open'],
        // The element that is role="menu", an entry, a separator and a group label.
        parts: ['root', 'item', 'separator', 'label'],
        // `closeAll()` closed the menu and its submenu: it is `close()`.
        removed: ['pdx-close', 'closeAll'],
    },
    {
        tag: 'pdx-tooltip',
        // The parent never writes its open state: `open-change` is a read-only output.
        models: [],
        // `placed-<side>`, the side it went to after flipping, draws the arrow.
        states: ['open', 'placed-top', 'placed-bottom', 'placed-left', 'placed-right'],
        parts: ['root', 'arrow'],
        removed: ['hide'],
    },
    {
        tag: 'pdx-dropdown-menu',
        // The parent never writes its open state: `open-change` is a read-only output.
        models: [],
        states: ['open'],
        // Its built-in button; the menu it opens is pdx-menu's, with its own parts.
        parts: ['trigger'],
        removed: ['open'],
    },
    {
        tag: 'pdx-context-menu',
        // The parent never writes its open state: `open-change` is a read-only output.
        models: [],
        states: ['open'],
        // The panel (on <body>), an entry, a separator and a group label, as pdx-menu's.
        parts: ['root', 'item', 'separator', 'label'],
        // `open(x, y)` is `show(x, y)`.
        removed: ['open'],
    },
    {
        tag: 'pdx-split-button',
        // The parent never writes its open state: `open-change` is a read-only output.
        models: [],
        // `loading` busies the primary button (A4).
        states: ['open', 'loading'],
        // The group, its primary button, the arrow; the menu (on <body>), an entry, a separator.
        parts: ['root', 'primary', 'trigger', 'menu', 'item', 'separator'],
        removed: [],
    },
];

/**
 * The two that hold other overlays and open nothing themselves (`pdx-toast`, `pdx-overlay-outlet`): no
 * open state, no `open-change`, no overlay verbs; their parts are listed.
 */
const HOLDERS_DONE: { tag: string; parts: string[] }[] = [
    // The stack, and a toast with its icon, title, message, action, close button and progress bar.
    { tag: 'pdx-toast', parts: ['root', 'toast', 'icon', 'title', 'message', 'action', 'close', 'progress'] },
    // The stack, and a dialog opened from code with its backdrop, panel and sections, and the buttons
    // and field each kind has: close (a dialog), cancel, confirm and confirm-input (a confirm), ok (an alert).
    {
        tag: 'pdx-overlay-outlet',
        parts: ['root', 'backdrop', 'panel', 'header', 'title', 'close', 'body', 'message', 'confirm-input', 'footer', 'cancel', 'confirm', 'ok'],
    },
];

describe.each(HOLDERS_DONE)('$tag, a holder on the beta contract', (row) => {
    const decl = decls.find((d) => d.tagName === row.tag);

    it('lists its public parts', () => {
        expect((decl?.cssParts ?? []).map((p) => p.name).sort()).toEqual([...row.parts].sort());
    });

    it('has no open state of its own, and announces none', () => {
        expect((decl?.cssStates ?? []).map((s) => s.name)).not.toContain('open');
        expect((decl?.events ?? []).map((e) => e.name)).not.toContain('open-change');
    });
});

/** The verbs every overlay drives its open state with, the names `<dialog>` uses. */
const VERBS = ['show', 'close', 'toggle'];
/** The events the beta took from every overlay. */
const REMOVED_EVENTS = ['pdx-open', 'pdx-close'];

describe.each(DONE)('$tag, on the beta contract', (row) => {
    const decl = decls.find((d) => d.tagName === row.tag);
    const events = (decl?.events ?? []).map((e) => e.name);
    const methods = (decl?.members ?? []).filter((m) => m.kind === 'method').map((m) => m.name);

    it('declares its models', () => {
        expect(decl?.models ?? []).toEqual(row.models);
    });

    it('announces its open state: an open custom state and open-change', () => {
        expect((decl?.cssStates ?? []).map((s) => s.name)).toContain('open');
        expect(events).toContain('open-change');
    });

    it('lists its states as custom states', () => {
        expect((decl?.cssStates ?? []).map((s) => s.name).sort()).toEqual([...row.states].sort());
    });

    it('lists its public parts', () => {
        expect((decl?.cssParts ?? []).map((p) => p.name).sort()).toEqual([...row.parts].sort());
    });

    it('drives it with show(), close() and toggle()', () => {
        expect(methods.filter((m) => VERBS.includes(m)).sort()).toEqual([...VERBS].sort());
    });

    it('declares none of its removed names', () => {
        const gone = [...REMOVED_EVENTS, ...row.removed];
        expect([...events, ...methods].filter((n) => gone.includes(n))).toEqual([]);
    });
});
