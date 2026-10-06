// Maps a Custom Elements Manifest attribute to a live UI control descriptor for the
// Props Playground. Type parsing is best-effort and ALWAYS degrades to a text input —
// never throw, so one odd type can't break a whole component page.

import type { CemMember } from './manifest';

export type ControlKind = 'boolean' | 'select' | 'number' | 'text';

export interface Control {
    name: string;             // prop name (for the label)
    attr: string;             // HTML attribute to set on the live element
    kind: ControlKind;
    options: string[];        // for kind === 'select'
    value: string;            // initial value (string form; '' = unset)
    description: string;
}

// Conventional value sets by prop NAME — the CEM types these as bare `string`, so we offer a
// dropdown instead of a guess-the-value text box. The component's own default is always included.
const KNOWN_ENUMS: Record<string, string[]> = {
    size: ['sm', 'md', 'lg'],
    shape: ['circle', 'square', 'rounded'],
    variant: ['primary', 'secondary', 'outline', 'ghost', 'link', 'danger', 'success', 'warning', 'info'],
    color: ['auto', 'primary', 'secondary', 'success', 'danger', 'warning', 'info', 'accent'],
    tone: ['primary', 'secondary', 'success', 'danger', 'warning', 'info', 'accent'],
    status: ['default', 'success', 'warning', 'danger', 'info'],
    placement: ['top', 'top-start', 'top-end', 'right', 'bottom', 'bottom-start', 'bottom-end', 'left'],
    position: ['top', 'right', 'bottom', 'left'],
    side: ['top', 'right', 'bottom', 'left'],
    align: ['start', 'center', 'end'],
    justify: ['start', 'center', 'end', 'between', 'around'],
    orientation: ['horizontal', 'vertical'],
    direction: ['horizontal', 'vertical'],
    labelposition: ['top', 'left', 'right'],
    labelplacement: ['top', 'left', 'right'],
    trigger: ['click', 'hover', 'focus', 'manual'],
};

// Per-component overrides where the generic set would be wrong (keyed `tag:prop`). More precise
// than the name-based defaults; takes priority.
const KNOWN_ENUMS_BY_TAG: Record<string, string[]> = {
    'pdx-avatar:shape': ['circle', 'square'],
    'pdx-badge:variant': ['default', 'primary', 'success', 'danger', 'warning', 'info'],
    'pdx-chip:variant': ['default', 'primary', 'success', 'danger', 'warning', 'info'],
    'pdx-banner:variant': ['info', 'success', 'warning', 'danger'],
    'pdx-toast:variant': ['info', 'success', 'warning', 'danger'],
    'pdx-alert-dialog:variant': ['info', 'success', 'warning', 'danger'],
    'pdx-spinner:variant': ['ring', 'dots', 'bars'],
    'pdx-progress:variant': ['primary', 'success', 'danger', 'warning'],
    'pdx-divider:orientation': ['horizontal', 'vertical'],
};

/** Parse a TS type like `'sm' | 'md' | 'lg'` (or double-quoted) into its literal members. */
function unionLiterals(typeText: string): string[] {
    const parts = typeText.split('|').map(p => p.trim());
    const lits: string[] = [];
    for (const p of parts) {
        const m = p.match(/^['"]([^'"]*)['"]$/);
        if (!m) return [];           // not a pure string-literal union → bail
        lits.push(m[1]);
    }
    return lits.length >= 2 ? lits : [];
}

/** Build a control descriptor from a CEM attribute (tag enables per-component enum overrides). */
export function controlFor(a: CemMember, tag = ''): Control {
    const attr = a.attribute || a.name;
    const typeText = (a.type?.text || '').trim();
    const def = a.default != null ? String(a.default).replace(/^['"]|['"]$/g, '') : '';
    const base = { name: a.name, attr, value: def, description: a.description || '' };

    if (typeText === 'boolean') {
        return { ...base, kind: 'boolean', options: [], value: def === 'true' ? 'true' : '' };
    }
    if (typeText === 'number') {
        return { ...base, kind: 'number', options: [] };
    }
    const lits = unionLiterals(typeText);
    if (lits.length) {
        return { ...base, kind: 'select', options: withDefault(lits, def) };
    }
    // Fallback enum for a well-known prop (CEM typed it as bare `string`): per-tag override, then name.
    const known = KNOWN_ENUMS_BY_TAG[`${tag}:${a.name}`] || KNOWN_ENUMS[a.name.toLowerCase()];
    if (known && (typeText === 'string' || typeText === '')) {
        return { ...base, kind: 'select', options: withDefault(known, def) };
    }
    return { ...base, kind: 'text', options: [] };
}

/** Make sure the live default is selectable, even if it isn't in the conventional set. */
function withDefault(opts: string[], def: string): string[] {
    return def && def !== 'auto' && !opts.includes(def) ? [def, ...opts] : opts;
}

/** Controls for a component's attributes, skipping object/array/function-typed members. */
export function controlsFor(attrs: CemMember[] | undefined, tag = ''): Control[] {
    return (attrs || [])
        .filter(a => {
            const t = (a.type?.text || '').toLowerCase();
            return !t.includes('=>') && !t.includes('[]') && t !== 'object' && t !== 'array' && t !== 'function';
        })
        .map(a => controlFor(a, tag));
}
