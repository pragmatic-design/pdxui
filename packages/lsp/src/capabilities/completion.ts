// Completion — provides autocomplete for rune names, component tags, and $t() keys.

import {
    CompletionItem,
    CompletionItemKind,
    InsertTextFormat,
} from 'vscode-languageserver';
import { RUNES } from '@pdxui/compiler';
import type { ComponentEntry, TranslationKeys } from '../utils/project-scanner';
import { type ManifestComponent, enumValues } from '../utils/manifest-index';
import type { TagContext } from '../utils/tag-context';

// ─── Rune Completion ────────────────────────────────────────────────

// From the compiler's one rune list: a rune it learns is offered here with nothing to add.
const RUNE_COMPLETIONS: CompletionItem[] = RUNES.map(r => ({
    label: (r.kind === 'decorator' ? '@' : '$') + r.name,
    kind: r.kind === 'decorator' ? CompletionItemKind.Keyword : CompletionItemKind.Function,
    detail: r.doc,
    documentation: r.shape,
    insertText: r.snippet,
    insertTextFormat: InsertTextFormat.Snippet,
}));

/** Get rune completion items (always available in <script setup>). */
export function getRuneCompletions(): CompletionItem[] {
    return RUNE_COMPLETIONS;
}

// ─── Component Tag Completion ───────────────────────────────────────

/** Get component tag completion items from scanned components. */
export function getComponentCompletions(components: ComponentEntry[]): CompletionItem[] {
    return components.map(c => ({
        label: c.tag,
        kind: CompletionItemKind.Class,
        detail: `Component: ${c.filePath.split('/').pop() ?? c.filePath}`,
    }));
}

/**
 * Every tag the document's project can use: its component packages' (with their description) and
 * its own .pdx components. Offering the project's alone, `<pdx-` would list no library component
 * at all.
 */
export function getRegistryTagCompletions(manifest: Map<string, ManifestComponent>, components: ComponentEntry[]): CompletionItem[] {
    const library: CompletionItem[] = [...manifest.values()].map(c => ({
        label: c.tag,
        kind: CompletionItemKind.Class,
        detail: 'Library component',
        documentation: c.description || undefined,
    }));
    return [...library, ...getComponentCompletions(components.filter(c => !manifest.has(c.tag)))];
}

/** The named slots of `comp`, for the value of a `slot="…"` on one of its children. */
export function getSlotCompletions(comp: ManifestComponent): CompletionItem[] {
    return comp.slots.filter(s => s.name).map(s => ({
        label: s.name,
        kind: CompletionItemKind.EnumMember,
        detail: `Slot of <${comp.tag}>`,
        documentation: s.description || undefined,
    }));
}

// ─── A component's attributes/events (from the manifest) ───────────────

/**
 * Completion inside an open tag `<pdx-xxx …>`:
 * - inside the value of an enum attribute → the values it allows;
 * - in "attribute name" position → attributes (with type/description) and events.
 */
export function getTagAttributeCompletions(comp: ManifestComponent, ctx: TagContext): CompletionItem[] {
    if (ctx.inValue) {
        const attr = comp.attributes.find(a => a.name === ctx.inValue);
        if (!attr) return [];
        return enumValues(attr.type).map(v => ({
            label: v, kind: CompletionItemKind.EnumMember, detail: attr.type, insertText: v,
        }));
    }

    const items: CompletionItem[] = [];
    for (const a of comp.attributes) {
        const doc = [a.description, a.default ? `Default: ${a.default}` : ''].filter(Boolean).join('\n\n');
        items.push({
            label: a.name,
            kind: CompletionItemKind.Property,
            detail: a.type || 'attribute',
            documentation: doc || undefined,
            insertText: a.name + '="$1"',
            insertTextFormat: InsertTextFormat.Snippet,
        });
    }
    for (const e of comp.events) {
        items.push({
            label: '@' + e.name,
            kind: CompletionItemKind.Event,
            detail: e.type || 'event',
            documentation: e.description || undefined,
            insertText: '@' + e.name + '="$1"',
            insertTextFormat: InsertTextFormat.Snippet,
        });
    }
    return items;
}

// ─── $t() Key Completion ────────────────────────────────────────────

/** Get translation key completion items. */
export function getTranslationKeyCompletions(translations: TranslationKeys[]): CompletionItem[] {
    // Merge all keys from all locales (deduplicated)
    const allKeys = new Set<string>();
    for (const t of translations) {
        for (const k of t.keys) allKeys.add(k);
    }

    return Array.from(allKeys).sort().map(key => ({
        label: key,
        kind: CompletionItemKind.Text,
        detail: 'Translation key',
        insertText: key,
    }));
}

// ─── Transition Preset Completion ────────────────────────────────────

const TRANSITION_PRESETS = ['fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'scale', 'none'];

export function getTransitionCompletions(): CompletionItem[] {
    return TRANSITION_PRESETS.map(p => ({
        label: p,
        kind: CompletionItemKind.EnumMember,
        detail: 'Transition preset',
    }));
}
