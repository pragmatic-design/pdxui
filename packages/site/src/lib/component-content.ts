/// <reference types="vite/client" />
// A component's rich content (content/components/<name>.ts: summary, demos, use cases, a11y), read
// by the component page and the pieces it composes.

import { examples } from './examples';

const mods = import.meta.glob('../content/components/*.ts', { eager: true }) as Record<string, { default: ComponentDoc }>;
const content: Record<string, ComponentDoc> = {};
for (const k in mods) content[k.split('/').pop()!.replace('.ts', '')] = mods[k].default;

export interface DocDemo { title: string; description?: string; src: string; }
export interface ComponentDoc {
    summary?: string;
    demos?: DocDemo[];
    useCases?: DocDemo[];
    a11y?: { keyboard?: { keys: string; desc: string }[]; notes?: string };
}

/** 'pdx-data-grid' → 'data-grid'. */
export function shortName(tag: string | null | undefined): string { return (tag || '').replace(/^pdx-/, ''); }

/** The content written for a tag, or null. */
export function contentOf(tag: string): ComponentDoc | null { return content[shortName(tag)] || null; }

/** The keyboard table and the notes of a tag's accessibility section. */
export function a11yOf(tag: string): { keyboard: { keys: string; desc: string }[]; notes: string } {
    const a11y = contentOf(tag)?.a11y;
    return { keyboard: a11y?.keyboard || [], notes: a11y?.notes || '' };
}

/** The hero demo: the first authored demo, else a curated example, else a bare instance. */
export function heroSourceOf(tag: string): string {
    const demos = contentOf(tag)?.demos || [];
    if (demos.length > 0) return demos[0].src;
    return examples[tag] || (tag && tag !== 'unknown' ? '<' + tag + '>' + shortName(tag) + '</' + tag + '>' : '');
}
