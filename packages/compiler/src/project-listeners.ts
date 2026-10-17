// The listeners a project's templates write, for PDX_EVENT_BUBBLES_UNUSED (#138).
//
// The resolver asks whether an event of a component is heard above it: a listener `@saved` written on
// any element that is not the component's own tag. Each project file is read and its template scanned
// for listener attributes, again whenever the file changes. Node only, as the resolver is: the
// diagnostic itself (`compiler/validate-event-bubbles.ts`) reads no file.

import { readFileSync, statSync } from 'fs';
import { parseSFC } from './parser/sfc';
import { openingTagTexts } from './text-scan';

/** One listener of a template: the event it hears and the tag it is written on. */
export interface TemplateListener { event: string; tag: string }

// Match: a listener attribute in an opening tag, with its modifiers. Groups: [1]=the event
const LISTENER = /(?<=\s)@([A-Za-z][\w:-]*)(?:\.[\w()]+)*(?=[\s=/>]|$)/g;

/** The listeners of a `.pdx`'s template: every `@event` attribute, and the tag it is on. */
export function templateListeners(source: string): TemplateListener[] {
    const template = parseSFC(source).template;
    if (!template || template.src) return [];
    const out: TemplateListener[] = [];
    for (const text of openingTagTexts(template.content)) {
        const tag = /^<([A-Za-z][\w-]*)/.exec(text)?.[1].toLowerCase();
        if (!tag) continue;
        for (const m of text.matchAll(LISTENER)) out.push({ event: m[1].toLowerCase(), tag });
    }
    return out;
}

/** The listeners of a set of project files, each read again whenever it changes. */
export class ProjectListeners {
    private files = new Map<string, { mtimeMs: number; listeners: TemplateListener[] }>();

    /** Whether a listener for `event` sits, in one of `files`, on a tag other than `ownTag`. */
    heardAbove(event: string, ownTag: string, files: readonly string[]): boolean {
        const name = event.toLowerCase();
        return files.some((file) => this.of(file).some((l) => l.event === name && l.tag !== ownTag));
    }

    private of(file: string): TemplateListener[] {
        try {
            const { mtimeMs } = statSync(file);
            const cached = this.files.get(file);
            if (cached && cached.mtimeMs === mtimeMs) return cached.listeners;
            const listeners = templateListeners(readFileSync(file, 'utf-8'));
            this.files.set(file, { mtimeMs, listeners });
            return listeners;
        } catch { return []; } // unreadable: it listens to nothing that can be known
    }
}
