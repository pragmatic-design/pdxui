// Hover — provides documentation on hover for runes, props, and keywords.

import type { Hover, Position } from 'vscode-languageserver';
import { MarkupKind } from 'vscode-languageserver';
import { RUNES } from '@pdxui/compiler';
import type { ManifestComponent } from '../utils/manifest-index';
import type { TagContext } from '../utils/tag-context';

// ─── Rune Documentation ─────────────────────────────────────────────

// From the compiler's one rune list: its shape and its one line, for every rune.
const RUNE_DOCS = new Map(RUNES.map(r => {
    const word = (r.kind === 'decorator' ? '@' : '$') + r.name;
    return [word, `**${word}** \`${r.shape}\`\n\n${r.doc}`] as const;
}));

/** Get hover documentation for a word at the given position. */
export function getHoverInfo(source: string, position: Position): Hover | null {
    const lines = source.split('\n');
    if (position.line >= lines.length) return null;

    const line = lines[position.line];
    const col = position.character;

    // The rune under the cursor: `@xxx` or `$xxx`, a whole word — `$d` is not the start of `$derived`.
    for (const m of line.matchAll(/[@$][A-Za-z][\w]*/g)) {
        if (col < m.index! || col > m.index! + m[0].length) continue;
        const doc = RUNE_DOCS.get(m[0]);
        if (doc) return { contents: { kind: MarkupKind.Markdown, value: doc } };
    }

    return null;
}

// ─── Hover over a component/attribute (from the manifest) ───────────────────

function md(value: string): Hover { return { contents: { kind: MarkupKind.Markdown, value } }; }

/**
 * Hover inside a tag `<pdx-xxx …>`:
 * - on an attribute's or event's name → its type, default and description;
 * - on the tag's name → the component's description + a summary of its props and events.
 */
export function getComponentHover(comp: ManifestComponent, ctx: TagContext): Hover | null {
    if (ctx.attrToken) {
        const bare = ctx.attrToken.replace(/^[:@]/, '');
        const ev = comp.events.find(e => e.name === bare);
        if (ev) {
            return md(`**@${ev.name}** — *event*${ev.type ? ` \`${ev.type}\`` : ''}\n\n${ev.description || ''}`);
        }
        const at = comp.attributes.find(a => a.name === bare);
        if (at) {
            const parts = [`**${at.name}**${at.type ? `: \`${at.type}\`` : ''}`];
            if (at.default) parts.push(`Default: \`${at.default}\``);
            if (at.description) parts.push(at.description);
            return md(parts.join('\n\n'));
        }
        return null;
    }

    if (ctx.onTagName) {
        const lines = [`**<${comp.tag}>**`];
        if (comp.description) lines.push(comp.description);
        if (comp.attributes.length) lines.push(`**Props:** ${comp.attributes.map(a => a.name).join(', ')}`);
        if (comp.events.length) lines.push(`**Events:** ${comp.events.map(e => '@' + e.name).join(', ')}`);
        const named = comp.slots.filter(s => s.name);
        if (named.length) lines.push(`**Slots:** ${named.map(s => s.name).join(', ')}`);
        return md(lines.join('\n\n'));
    }

    return null;
}
