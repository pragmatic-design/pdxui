// pdx-json-editor — schema-driven form editor for nested JSON (object / list-of-objects / 2-level dict).
// Scalars render inline; each complex branch (object / objectList) is a "Edit…" button opening a sub-modal,
// so the UI stays uncluttered. Recursive renderer: every control exposes { el, read() } — no DOM queries,
// so repeaters/nesting compose unambiguously. Emits `pdx-change` { value } whenever the edited value changes.
// Promoted from the hand-built profiler editor (UI-15h), generalized: enum options come from `values` (static)
// or `options` (async () => {label,value}[]) — no app-specific lookup coupling.
//
// Usage:
//   <pdx-json-editor :schema="${schema}" :value="${obj}"></pdx-json-editor>
//   el.addEventListener('pdx-change', e => save(e.detail.value));

import { component, html, focusTrap, focusFirst } from '@pdxui/core';
import { uiString, format } from '../shared/i18n';
import { setOwnProp } from '../shared/own-prop';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/json-editor';
import '../button/pdx-button'; // rendered by this component, and registered by nobody else
import '../input/pdx-input'; // rendered by this component, and registered by nobody else
import '../number-input/pdx-number-input'; // rendered by this component, and registered by nobody else
import '../select/pdx-select'; // rendered by this component, and registered by nobody else
import '../switch-toggle/pdx-switch'; // rendered by this component, and registered by nobody else
import '../tag-input/pdx-tag-input'; // rendered by this component, and registered by nobody else

type Ctrl = { el: HTMLElement; read: () => unknown };
/**
 * Told when an edit changes the document outside a native input event: a sub-modal applied, a row
 * of a root-level list removed. It is a callback, not an event bubbling out of the host, so it is
 * not part of the component's API. Inside a sub-modal it does nothing: nothing there
 * is the document until Apply.
 */
type OnEdit = () => void;
const inModal: OnEdit = () => {};

/** Instance counter for the ids that name the sub-modals. */
let _modalSeq = 0;

interface FieldDef {
    k?: string;
    label: string;
    type?: 'object' | 'objectList' | 'taglist' | 'enum' | 'bool' | 'number' | 'date' | 'time' | string;
    req?: boolean;
    fields?: FieldDef[];
    values?: string[];
    options?: (() => Promise<{ label: string; value: string }[]>) | { label: string; value: string }[];
}

async function optionsFor(f: FieldDef): Promise<{ label: string; value: string }[]> {
    if (f.values) return f.values.map((v) => ({ label: v, value: v }));
    if (typeof f.options === 'function') return await f.options();
    if (Array.isArray(f.options)) return f.options;
    return [];
}

const isEmpty = (v: unknown): boolean =>
    v == null || v === '' || (Array.isArray(v) && v.length === 0) ||
    (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0);

/**
 * A field's caption. A `<label>` only around a native control: around a component host (every pdx-*
 * field is form-associated, so labelable) the label would name the host, which has no role, and the
 * control inside would stay unnamed — and a click on the text would go to the host and toggle
 * nothing. Those are named through their own prop instead.
 */
function labeled(text: string, req?: boolean, native = false): HTMLElement {
    const wrap = document.createElement(native ? 'label' : 'div'); wrap.className = 'jfld';
    const span = document.createElement('span'); span.textContent = text + (req ? ' *' : ''); wrap.appendChild(span);
    return wrap;
}

/**
 * The sub-modal: a modal dialog named by the branch, with focus on its first field, trapped, and back
 * on `opener` when it closes. As a plain div, focus would stay behind it, Tab would reach the page,
 * and after Apply focus would fall to <body>. Escape, Cancel and the backdrop close it unapplied.
 */
function runModal(title: string, buildRoot: () => Promise<Ctrl>, opener: HTMLElement): Promise<unknown> {
    return new Promise((resolve) => {
        const back = document.createElement('div'); back.className = 'jed-back';
        const box = document.createElement('div'); box.className = 'jed-box';
        const headId = `jed-head-${++_modalSeq}`;
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        box.setAttribute('aria-labelledby', headId);
        box.tabIndex = -1;
        const head = document.createElement('div'); head.className = 'jed-head'; head.id = headId; head.textContent = title;
        const body = document.createElement('div'); body.className = 'jed-body';
        const foot = document.createElement('div'); foot.className = 'jed-foot';
        const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'jed-cancel'; cancel.textContent = uiString('json-editor', 'cancel');
        const save = document.createElement('button'); save.type = 'button'; save.className = 'jed-ok'; save.textContent = uiString('json-editor', 'apply');
        foot.append(cancel, save); box.append(head, body, foot); back.appendChild(box);
        let root: Ctrl | null = null;
        let closed = false;
        const close = (v: unknown) => {
            if (closed) return;
            closed = true;
            releaseTrap();
            back.remove();
            if (opener.isConnected) opener.focus();
            resolve(v);
        };
        cancel.onclick = () => close(undefined);
        save.onclick = () => close(root ? root.read() : undefined);
        back.onclick = (e) => { if (e.target === back) close(undefined); };
        box.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            // Only this modal: one opened from it is a sibling, and closes itself.
            e.stopPropagation();
            close(undefined);
        });
        document.body.appendChild(back);
        // The dialog holds focus while its fields are built; then the first of them takes it.
        const releaseTrap = focusTrap(box, { initialFocus: box, restoreFocus: false });
        buildRoot().then((r) => {
            root = r;
            body.appendChild(r.el);
            if (!closed && document.activeElement === box) focusFirst(body);
        });
    });
}

function makeComplex(f: FieldDef, val: unknown, onEdit: OnEdit): Ctrl {
    let state: unknown = f.type === 'objectList' ? (Array.isArray(val) ? val : []) : (val || null);
    const wrap = document.createElement('div'); wrap.className = 'jcomplex';
    const lab = document.createElement('span'); lab.className = 'jcomplex-l'; lab.textContent = f.label;
    const summary = document.createElement('span'); summary.className = 'jcomplex-s';
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'jcomplex-b'; btn.textContent = uiString('json-editor', 'edit');
    const refresh = () => {
        if (f.type === 'objectList') summary.textContent = (state as unknown[]).length ? `${(state as unknown[]).length} item(s)` : 'empty';
        else summary.textContent = !isEmpty(state) ? 'set' : 'empty';
    };
    refresh();
    btn.onclick = async () => {
        const v = await runModal(f.label, () => f.type === 'objectList' ? makeListBody(f, state, inModal) : makeObjectBody(f, state, inModal), btn);
        if (v !== undefined) { state = v; refresh(); onEdit(); }
    };
    wrap.append(lab, summary, btn);
    return { el: wrap, read: () => f.type === 'objectList' ? state : (isEmpty(state) ? null : state) };
}

async function makeObjectBody(f: FieldDef, val: unknown, onEdit: OnEdit): Promise<Ctrl> {
    const box = document.createElement('div'); box.className = 'jobj-b';
    const cs: Record<string, Ctrl> = {};
    const rec = (val ?? {}) as Record<string, unknown>;
    for (const sf of f.fields ?? []) { const c = await makeField(sf, rec[sf.k!], onEdit); cs[sf.k!] = c; box.appendChild(c.el); }
    return { el: box, read: () => { const o: Record<string, unknown> = {}; for (const k in cs) { const v = cs[k].read(); if (!isEmpty(v)) o[k] = v; } return isEmpty(o) ? null : o; } };
}

async function makeListBody(f: FieldDef, val: unknown, onEdit: OnEdit): Promise<Ctrl> {
    const box = document.createElement('div'); box.className = 'jlist';
    const rowsHost = document.createElement('div'); rowsHost.className = 'jrows'; box.appendChild(rowsHost);
    const empty = document.createElement('div'); empty.className = 'jlist-empty'; empty.textContent = uiString('json-editor', 'empty');
    box.appendChild(empty);
    const rows: { read: () => unknown }[] = [];
    const syncEmpty = () => { empty.style.display = rows.length ? 'none' : ''; };
    // The delete button is named after its row, not by its emoji.
    const renumber = () => {
        [...rowsHost.children].forEach((c, i) => {
            const n = c.querySelector('.jrow-n'); if (n) n.textContent = '#' + (i + 1);
            const del = c.querySelector('.jrow-del');
            if (del) { const name = format(uiString('json-editor', 'removeItem'), { n: i + 1 }); del.setAttribute('aria-label', name); del.setAttribute('title', name); }
        });
    };
    const addRow = async (rv: unknown) => {
        const card = document.createElement('div'); card.className = 'jrow';
        const idx = document.createElement('span'); idx.className = 'jrow-n';
        const bodyCtrl = await makeObjectBody(f, rv, onEdit);
        const fwrap = document.createElement('div'); fwrap.className = 'jrow-f'; fwrap.appendChild(bodyCtrl.el);
        const del = document.createElement('button'); del.type = 'button'; del.className = 'jrow-del'; del.textContent = '🗑';
        const rc = { read: () => bodyCtrl.read() || {} };
        del.onclick = () => { const i = rows.indexOf(rc); if (i >= 0) rows.splice(i, 1); card.remove(); syncEmpty(); renumber(); onEdit(); };
        card.append(idx, fwrap, del); rowsHost.appendChild(card); rows.push(rc); renumber(); syncEmpty();
    };
    for (const rv of (Array.isArray(val) ? val : [])) await addRow(rv);
    const foot = document.createElement('div'); foot.className = 'jlist-add';
    const add = document.createElement('pdx-button'); add.setAttribute('size', 'sm'); add.setAttribute('variant', 'primary'); add.textContent = uiString('json-editor', 'addItem');
    add.addEventListener('click', () => addRow(null));
    foot.appendChild(add); box.appendChild(foot);
    return { el: box, read: () => rows.map((r) => r.read()).filter((o) => !isEmpty(o)) };
}

async function makeField(f: FieldDef, val: unknown, onEdit: OnEdit): Promise<Ctrl> {
    if (f.type === 'object' || f.type === 'objectList') return makeComplex(f, val, onEdit);
    if (f.type === 'taglist') {
        const wrap = labeled(f.label, f.req);
        const ti = document.createElement('pdx-tag-input') as HTMLElement & { value: unknown };
        ti.setAttribute('label', f.label);
        ti.value = Array.isArray(val) ? val : []; wrap.appendChild(ti);
        return { el: wrap, read: () => (ti.value || []) };
    }
    if (f.type === 'enum') {
        const wrap = labeled(f.label, f.req);
        const sel = document.createElement('pdx-select') as HTMLElement & { options: unknown; value: unknown };
        sel.setAttribute('label', f.label);
        sel.setAttribute('searchable', ''); if (!f.req) sel.setAttribute('clearable', '');
        sel.options = await optionsFor(f); sel.value = val == null ? '' : val;
        wrap.appendChild(sel);
        return { el: wrap, read: () => { const v = sel.value || ''; return v === '' ? null : v; } };
    }
    if (f.type === 'bool') {
        // The switch's own label: its text beside the switch, the switch's name, and a click on it
        // toggles. A caption above it would name nothing, and a click on it would change nothing.
        const wrap = document.createElement('div'); wrap.className = 'jfld jfld-bool';
        const sw = document.createElement('pdx-switch') as HTMLElement & { checked: boolean };
        sw.setAttribute('label', f.label);
        queueMicrotask(() => { sw.checked = !!val; }); wrap.appendChild(sw);
        return { el: wrap, read: () => !!sw.checked };
    }
    if (f.type === 'number') {
        const wrap = labeled(f.label, f.req);
        const ni = document.createElement('pdx-number-input') as HTMLElement & { value: unknown };
        ni.setAttribute('aria-label', f.label);
        queueMicrotask(() => { const i = ni.querySelector('input'); if (i) i.value = val == null ? '' : String(val); else ni.value = val; }); wrap.appendChild(ni);
        return { el: wrap, read: () => { const i = ni.querySelector('input'); const x = (i ? i.value : '') || ''; return x === '' ? null : Number(x); } };
    }
    if (f.type === 'date' || f.type === 'time') {
        const wrap = labeled(f.label, f.req, true);
        const inp = document.createElement('input'); inp.type = f.type; inp.className = 'jdt'; inp.value = val == null ? '' : String(val); wrap.appendChild(inp);
        return { el: wrap, read: () => inp.value || null };
    }
    const wrap = labeled(f.label, f.req);
    const ip = document.createElement('pdx-input') as HTMLElement & { value: unknown };
    ip.setAttribute('aria-label', f.label);
    queueMicrotask(() => { const i = ip.querySelector('input'); if (i) i.value = val == null ? '' : String(val); else ip.value = val; }); wrap.appendChild(ip);
    return { el: wrap, read: () => { const i = ip.querySelector('input'); const v = (i ? i.value : '') || ''; return v === '' ? null : v; } };
}

async function buildRoot(schema: FieldDef & { kind?: 'object' | 'list'; item?: FieldDef[] }, data: unknown, onEdit: OnEdit): Promise<Ctrl> {
    if (schema.kind === 'list') return makeListBody({ label: schema.label, fields: schema.item }, data, onEdit);
    return makeObjectBody({ label: schema.label, fields: schema.fields }, data, onEdit);
}

/**
 * A form, drawn from a schema, for editing a nested JSON value: scalars are edited inline, and each
 * object or list of objects in a sub-modal of its own.
 */
component('pdx-json-editor', {
    props: {
        schema: { type: Object, default: null },
        value: { type: Object, default: null },
    },
    setup(ctx) {
        let root: Ctrl | null = null;
        // `value` is the live document: every edit writes it. The track below rebuilds
        // the editor when `value` changes, so it must recognise its own reflection — rebuilding on
        // every keystroke would replace the field being typed in.
        let _reflected: unknown = undefined;
        let _builtSchema: unknown = undefined;

        function emit(): void {
            if (!root) return;
            const v = root.read();
            const value = isEmpty(v) ? null : v;
            _reflected = value;
            setOwnProp(ctx.el, 'value', value);
            ctx.emit('pdx-change', { value });
        }

        ctx.track(() => {
            const schema = ctx.schema() as (FieldDef & { kind?: 'object' | 'list'; item?: FieldDef[] }) | null;
            const raw = ctx.value() as unknown;
            if (!schema) return;
            if (raw === _reflected && schema === _builtSchema) return;
            _builtSchema = schema;
            const data = typeof raw === 'string' ? safeParse(raw) : raw;
            // ctx.frame: a setup a move destroyed does not build again; and the root is built
            // asynchronously, so a build this run no longer owns — a destroyed setup, or a later run
            // of this track — does not append its root next to the current one.
            let superseded = false;
            ctx.frame(() => {
                ctx.el.innerHTML = '';
                ctx.el.classList.add('pdx-json-editor-root');
                buildRoot(schema, data, () => { if (!superseded) emit(); }).then((r) => {
                    if (superseded) return;
                    root = r;
                    ctx.el.appendChild(r.el);
                    // Recompute + emit on any edit within (inputs, selects); sub-modal applies and
                    // root-list removals come through buildRoot's onEdit.
                    r.el.addEventListener('input', emit);
                    r.el.addEventListener('change', emit);
                    r.el.addEventListener('pdx-change', emit);
                });
            });
            return () => { superseded = true; };
        });

        return { read: () => (root ? root.read() : null) };
    },
    render: () => html``,
});

function safeParse(s: string): unknown {
    try { return s ? JSON.parse(s) : null; } catch { return null; }
}
