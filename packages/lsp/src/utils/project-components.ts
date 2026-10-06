// Project components, described the way the manifest describes a library one — props, events,
// slots — from the compiler's analysis of their .pdx. Completion and hover read one shape
// for both, so a project component gets what a library component gets.

import { readFileSync } from 'fs';
import { parseSFC, analyzeScript } from '@pdxui/compiler';
import type { ManifestComponent, ManifestSlot } from './manifest-index';

/**
 * The description of the project component in `filePath`, or null when the file cannot be read or
 * parsed. Props and events come from `@prop` / `@event`; slots from `@slot` and from the `<slot>`
 * elements its template renders (the default slot is named '').
 */
export function describeProjectComponent(tag: string, filePath: string): ManifestComponent | null {
    let source: string;
    try { source = readFileSync(filePath, 'utf-8'); } catch { return null; } // gone since the scan
    try {
        const descriptor = parseSFC(source);
        const analysis = analyzeScript(descriptor.script?.content ?? '', filePath, { setup: descriptor.script?.setup });
        const slots = new Map<string, ManifestSlot>();
        for (const s of analysis.slots) slots.set(s.name, { name: s.name, description: s.scopeType ? `Scope: ${s.scopeType}` : '' });
        // Match: <slot> or <slot name="x"> in the template.  Groups: [2]=the name
        for (const m of (descriptor.template?.content ?? '').matchAll(/<slot\b(?:[^>]*?\bname\s*=\s*(["'])([^"']*)\1)?[^>]*>/g)) {
            const name = m[2] ?? '';
            if (!slots.has(name)) slots.set(name, { name, description: '' });
        }
        return {
            tag,
            description: '',
            filePath,
            attributes: analysis.props.map(p => ({ name: p.name, type: p.tsType, default: p.default, description: '' })),
            events: analysis.events.map(e => ({ name: e.name, type: e.payloadType, description: '' })),
            slots: [...slots.values()],
        };
    } catch {
        return null; // a file mid-edit that does not parse: no description rather than a wrong one
    }
}
