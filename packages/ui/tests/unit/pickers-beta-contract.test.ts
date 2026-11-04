// The picker components brought to the beta contract (#287): each declares its model, its visual
// states and its public parts, and the manifest lists them, which is what a theme and an agent's page
// card read (docs/language/beta/library.md, «Done, for one component»). A picker with a popup announces
// it as an overlay does: an `open` state and `open-change` `{ value }`, in place of `pdx-open` and
// `pdx-close`, and drives it with the overlay verbs. A row joins `DONE` in the pull request that brings
// its component over; the rest of the family follows the same table.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { cleanup, mount } from './helpers';
import '../../src/select/pdx-select';
import '../../src/autocomplete/pdx-autocomplete';
import '../../src/cascader/pdx-cascader';
import '../../src/tree-select/pdx-tree-select';
import '../../src/transfer/pdx-transfer';
import '../../src/date-picker/pdx-date-picker';
import '../../src/time-picker/pdx-time-picker';
import '../../src/calendar/pdx-calendar';
import '../../src/color-picker/pdx-color-picker';
import '../../src/file-upload/pdx-file-upload';

const root = join(__dirname, '..', '..');
type Named = { name: string };
type Member = { kind: string; name: string };
type Decl = {
    tagName?: string; models?: string[]; formAssociated?: boolean;
    cssStates?: Named[]; cssParts?: Named[]; cssProperties?: Named[]; events?: Named[]; members?: Member[];
};

// The tokens of a picker drawn by the text input's frame, `.pdx-input-wrap` (#761): the frame keeps
// pdx-input's names, and the manifest lists the ones the frame reads for it. A picker with the
// invalid, success and warning states reads the frame's tokens for them as well.
const FRAME = ['--pdx-input-border-color', '--pdx-input-border-color-focus', '--pdx-input-border-width', '--pdx-input-focus-ring', '--pdx-input-min-height'];
const FRAME_STATES = [...FRAME, '--pdx-input-border-color-invalid', '--pdx-input-border-color-success', '--pdx-input-border-color-warning'];
const decls = (JSON.parse(readFileSync(join(root, 'custom-elements.json'), 'utf8')) as { modules: { declarations: Decl[] }[] })
    .modules.flatMap((m) => m.declarations);

interface Row {
    tag: string;
    model: string;
    states: string[];
    parts: string[];
    /** It renders a popup: `open` is among its states and `open-change` among its events. */
    popup: boolean;
    /** The methods the issue lists for it, all declared. */
    methods: string[];
    /** Names it set on the element before, now gone: alias methods the overlay verbs replace. */
    removedMethods: string[];
    /**
     * The custom properties its manifest lists (#761, #287 item 5), all of them: the text input's frame
     * tokens for a picker drawn by it, its own for one that draws its own surface — the colours of its
     * states and of what it shows selected, each defaulting to the global token its rule read before.
     */
    tokens: string[];
}

const DONE: Row[] = [
    {
        tag: 'pdx-select',
        model: 'value',
        states: ['open', 'invalid', 'success', 'warning', 'disabled', 'readonly', 'loading', 'multiple'],
        parts: ['root', 'search', 'tag', 'clear', 'spinner', 'popup', 'list', 'option'],
        popup: true,
        methods: ['focus', 'blur', 'clear', 'show', 'close', 'toggle'],
        removedMethods: ['openSelect', 'closeSelect', 'toggleSelect'],
        tokens: [...FRAME_STATES, '--pdx-select-caret-size', '--pdx-select-caret-stroke'],
    },
    {
        tag: 'pdx-autocomplete',
        model: 'value',
        states: ['open', 'invalid', 'success', 'warning', 'disabled', 'readonly', 'loading'],
        parts: ['root', 'input', 'clear', 'spinner', 'popup', 'list', 'option'],
        popup: true,
        methods: ['clear', 'getText', 'getSelectedItem', 'show', 'close', 'toggle'],
        // `open()` is the overlay verb `show()` (#287, decision 50).
        removedMethods: ['open'],
        tokens: FRAME_STATES,
    },
    {
        tag: 'pdx-cascader',
        model: 'value',
        // `loading` while a lazy branch is fetched; it has no error, success or readonly of its own.
        states: ['open', 'disabled', 'loading'],
        parts: ['root', 'clear', 'popup', 'search', 'list', 'option', 'spinner'],
        popup: true,
        methods: ['getLabels', 'clear', 'show', 'close', 'toggle'],
        // getValue/setValue duplicated the model, which is the way (#287); openCascader/closeCascader
        // were set on the element undeclared, and are the overlay verbs.
        removedMethods: ['getValue', 'setValue', 'openCascader', 'closeCascader'],
        tokens: FRAME,
    },
    {
        tag: 'pdx-tree-select',
        model: 'value',
        states: ['open', 'disabled', 'loading'],
        // A tree, so its parts are named by its roles: the `tree` and a `node`, with a node's `toggle`.
        parts: ['root', 'clear', 'popup', 'search', 'tree', 'node', 'toggle'],
        popup: true,
        methods: ['getLabel', 'clear', 'show', 'close', 'toggle'],
        removedMethods: ['getValue', 'setValue', 'openTreeSelect', 'closeTreeSelect'],
        tokens: FRAME,
    },
    {
        tag: 'pdx-transfer',
        model: 'value',
        // Two lists side by side, no popup.
        states: ['disabled'],
        parts: ['root', 'panel', 'search', 'list', 'option', 'move'],
        popup: false,
        methods: ['clear', 'getChanges', 'getDirection'],
        removedMethods: ['getValue', 'setValue'],
        // A checked row, and its check.
        tokens: ['--pdx-transfer-option-bg-selected', '--pdx-transfer-check-bg-selected'],
    },
    {
        tag: 'pdx-date-picker',
        model: 'value',
        // The trigger's `aria-invalid` on a typed date that cannot be read is the input's own, not a state.
        states: ['open', 'disabled', 'readonly'],
        // The calendar inside the popup is a part: its own parts are pdx-calendar's row.
        parts: ['root', 'input', 'clear', 'popup', 'preset', 'calendar'],
        popup: true,
        methods: ['getDate', 'getRange', 'getTime', 'getEndTime', 'focus', 'blur', 'clear', 'show', 'close', 'toggle'],
        // openPopover/closePopover were set on the element undeclared, and are the overlay verbs.
        removedMethods: ['openPopover', 'closePopover'],
        tokens: FRAME,
    },
    {
        tag: 'pdx-time-picker',
        model: 'value',
        // Spinbuttons in a group, no popup.
        states: ['disabled'],
        parts: ['root', 'segment', 'arrow', 'separator'],
        popup: false,
        methods: ['focus', 'blur', 'clear'],
        removedMethods: [],
        // The segment being edited.
        tokens: ['--pdx-time-picker-segment-bg-focus', '--pdx-time-picker-segment-color-focus'],
    },
    {
        tag: 'pdx-calendar',
        model: 'value',
        // A grid in a group, no popup.
        states: ['disabled'],
        parts: ['root', 'nav', 'prev', 'title', 'next', 'grid', 'cell'],
        popup: false,
        methods: ['focusView', 'getRange', 'getQuarter'],
        removedMethods: [],
        // A selected day (and a range's ends, and a selected month or year), the days inside a range, today.
        tokens: ['--pdx-calendar-cell-bg-selected', '--pdx-calendar-cell-color-selected', '--pdx-calendar-cell-bg-in-range', '--pdx-calendar-cell-color-today'],
    },
    {
        tag: 'pdx-color-picker',
        model: 'value',
        states: ['open', 'disabled', 'readonly'],
        // The popup is the panel in place when `inline`.
        parts: ['root', 'popup', 'area', 'hue', 'alpha', 'input', 'clear', 'preset'],
        popup: true,
        methods: ['focus', 'blur', 'clear', 'getHex', 'getRgb', 'getHsl', 'show', 'close', 'toggle'],
        // `open()` was set on the element undeclared, and is the overlay verb `show()`; `close()` stays.
        removedMethods: ['open'],
        // The chosen preset's ring.
        tokens: ['--pdx-color-picker-preset-ring-active'],
    },
    {
        tag: 'pdx-file-upload',
        model: 'value',
        // A drop zone and a list, no popup; busy while a file uploads is the list's aria-busy.
        states: ['disabled', 'dragover'],
        parts: ['root', 'dropzone', 'list', 'file', 'remove', 'progress'],
        popup: false,
        methods: ['addFiles', 'removeFile', 'uploadAll', 'clear'],
        removedMethods: [],
        // A drag over the drop zone.
        tokens: ['--pdx-file-upload-border-color-dragover', '--pdx-file-upload-bg-dragover'],
    },
];

/** The events the beta took from a picker: the popup's alpha pair, and the alpha change events (#125). */
const REMOVED_EVENTS = ['pdx-open', 'pdx-close', 'pdx-change', 'change', 'valuechange', 'pdx-input'];

beforeEach(cleanup);

describe.each(DONE)('$tag, on the beta contract', (row) => {
    const decl = decls.find((d) => d.tagName === row.tag);
    const events = (decl?.events ?? []).map((e) => e.name);

    it('declares its model', () => {
        expect(decl?.models).toEqual([row.model]);
    });

    it('lists its states as custom states', () => {
        expect((decl?.cssStates ?? []).map((s) => s.name).sort()).toEqual([...row.states].sort());
    });

    it('lists its public parts', () => {
        expect((decl?.cssParts ?? []).map((p) => p.name).sort()).toEqual([...row.parts].sort());
    });

    it('is form-associated, through its model', () => {
        expect(decl?.formAssociated).toBe(true);
    });

    it('announces its popup with open-change and an open state, or has neither', () => {
        expect(events.includes('open-change')).toBe(row.popup);
        expect((decl?.cssStates ?? []).some((s) => s.name === 'open')).toBe(row.popup);
    });

    it('declares no removed event', () => {
        expect(events.filter((n) => REMOVED_EVENTS.includes(n))).toEqual([]);
    });

    it('declares its methods', () => {
        const methods = (decl?.members ?? []).filter((m) => m.kind === 'method').map((m) => m.name);
        expect(methods.filter((m) => row.methods.includes(m)).sort()).toEqual([...row.methods].sort());
    });

    it('lists its tokens in the manifest (#761)', () => {
        expect((decl?.cssProperties ?? []).map((p) => p.name).sort()).toEqual([...row.tokens].sort());
    });

    it('sets none of its removed methods on the element', async () => {
        const el = await mount(row.tag) as unknown as Record<string, unknown>;
        expect(row.removedMethods.filter((m) => m in el)).toEqual([]);
    });
});
