// Component Index — maps a component tag to its declared props/events, by analyzing
// every workspace .pdx. Powers cross-file references/rename of @prop and @event: a
// consumer uses them as attributes (`<pdx-foo :prop @event>`), so we must know which
// component a tag refers to and what it exposes.

import { deriveTag } from '@pdxui/compiler';
import { analyzeDocument } from './compiler-bridge';

export interface ComponentInfo {
    tag: string;
    uri: string;
    props: Set<string>;
    events: Set<string>;
    /** True if the tag comes from an explicit @tag rune (not the filename). */
    usesCustomTag: boolean;
}

interface SourceFile { uri: string; content: string; }

/**
 * Default custom-element tag from a .pdx URI — the compiler's own rule, so the editor names a
 * component as the build registers it (`App.pdx` → `pdx-app`, `admin/_layout.pdx` →
 * `pdx-admin-layout`). A copy of it here would drift.
 */
export function tagFromUri(uri: string): string {
    return deriveTag(uri);
}

/** Analyze a file and return its component tag (@tag override or filename-derived). */
export function tagOf(file: SourceFile): string {
    const { analysis } = analyzeDocument(file.content, tagFromUri(file.uri));
    return analysis?.customTag ?? tagFromUri(file.uri);
}

/** Build tag → { props, events } for every workspace .pdx. */
export function buildComponentIndex(files: SourceFile[]): Map<string, ComponentInfo> {
    const index = new Map<string, ComponentInfo>();
    for (const file of files) {
        const { analysis } = analyzeDocument(file.content, tagFromUri(file.uri));
        if (!analysis) continue;
        const tag = analysis.customTag ?? tagFromUri(file.uri);
        index.set(tag, {
            tag,
            uri: file.uri,
            props: new Set(analysis.props.map(p => p.name)),
            events: new Set(analysis.events.map(e => e.name)),
            usesCustomTag: !!analysis.customTag,
        });
    }
    return index;
}
