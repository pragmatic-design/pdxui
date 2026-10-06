// Where the work goes while it is still unsaved.
//
// Asking before leaving is not enough protection on its own. The answer to «you have
// unsaved work» is a QUESTION, never a place to put the work: a reload, a crash, a closed tab and
// a session that expired are all silent losses, and `onBeforeLeave` sees none of them.
//
// ── Why not `@store` with `persist` ──
//
// It is the machinery this looked like a job for, and it is the wrong one, for one reason:
// `createGlobalStore(id, setup, { persist })` READS the saved state into the signals as it creates
// the store (`core/src/reactivity/global-store.ts:36`). A form that refills itself is how someone
// submits last week's answers without noticing — the draft has to be OFFERED, which means the
// reading and the applying are two moments and the page decides the second one.
//
// It is a module and not a page-local closure so the second form can use it without copying: what
// is here is the part that has nothing to do with an intake.

/** What was kept, and what could not be. */
export interface DraftRecord<T> {
    /** The values, minus anything that is not data. */
    values: T;
    /** Where the reader was — a wizard step, a tab, a section. */
    step: number;
    /** ISO, so the offer can say WHEN. «You have a draft» with no date is a thing nobody can judge. */
    savedAt: string;
    /**
     * The names of the files the draft could not hold.
     *
     * A file is not in `localStorage` — not its bytes, and not a pretence that it is still there.
     * A restored form that says nothing about the attachment it lost is worse than one that lost
     * it loudly: the reader submits believing it is attached.
     */
    dropped: string[];
}

export interface DraftBox<T> {
    /** The saved draft, or null. It does not apply anything: that is the page's decision. */
    read(): DraftRecord<T> | null;
    /** Schedule a write. Debounced — a draft per keystroke is a write per keystroke. */
    save(values: T, step: number): void;
    /** Write now, whatever the debounce is holding. */
    flush(): void;
    /** Throw it away: a submit that went through, or a reader who said no. */
    clear(): void;
    /** Stop listening for the page going away. The page calls it in `onDestroy`. */
    dispose(): void;
}

export interface DraftOptions {
    /** How long the typing has to stop before the draft is written. */
    debounceMs?: number;
    /** Called after each write, with what was written — the page's «saved» marker hangs off this. */
    onSave?: (record: DraftRecord<unknown>) => void;
}

/**
 * Everything that is not data, removed, with the file names collected on the way.
 *
 * Recursive rather than a list of known keys: the caller hands over whatever the form holds, and a
 * rule that only knew about `attachment` would be wrong the first time a row grew one. `undefined`
 * means «this is not draftable» and the key is left out entirely, which is also what
 * `JSON.stringify` would have done — silently, and without telling anyone which one.
 */
function draftable(value: unknown, dropped: string[]): unknown {
    if (value == null) return value;
    // File before Blob: a File IS a Blob, and the name is the whole point of saying which one.
    if (typeof File !== 'undefined' && value instanceof File) { dropped.push(value.name); return undefined; }
    if (typeof Blob !== 'undefined' && value instanceof Blob) { dropped.push('(file)'); return undefined; }
    if (typeof value === 'function') return undefined;
    if (Array.isArray(value)) return value.map((v) => draftable(v, dropped)).filter((v) => v !== undefined);
    if (typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
            const kept = draftable(v, dropped);
            if (kept !== undefined) out[key] = kept;
        }
        return out;
    }
    return value;
}

/** A draft under `key`, in `localStorage`. */
export function createDraft<T>(key: string, options: DraftOptions = {}): DraftBox<T> {
    const storageKey = `pdx.draft.${key}`;
    const wait = options.debounceMs ?? 400;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending: DraftRecord<T> | null = null;
    // Private mode, a full quota, a policy that blocks storage: write once, fail, and stop trying.
    let usable = true;

    function write(): void {
        timer = null;
        const record = pending;
        pending = null;
        if (!record || !usable) return;
        try {
            localStorage.setItem(storageKey, JSON.stringify(record));
            options.onSave?.(record as DraftRecord<unknown>);
        } catch {
            // Storage refused. Stop trying rather than throwing on every keystroke, and make
            // `read()` honest about it: there is no draft, because nothing was written.
            usable = false;
        }
    }

    /**
     * The debounce's own hole, and it is the one this story is about.
     *
     * A write 400ms after the last keystroke loses the last keystrokes to exactly the events a
     * draft exists for: a closed tab, a reload, a crash, a navigation away. Measured — a form
     * filled and reloaded straight after came back to the step before the last one, because the
     * timer never fired. `pagehide` is the event that still runs when a page is going away (it
     * fires on a reload, on a close, and into the back/forward cache, where `unload` does not), and
     * `visibilitychange` covers the tab that is switched away from and killed later without ever
     * being shown again.
     *
     * `localStorage.setItem` is synchronous, so the write lands inside the handler.
     */
    function flushNow() {
        if (timer !== null) { clearTimeout(timer); write(); }
    }
    const onHidden = (): void => { if (document.visibilityState === 'hidden') flushNow(); };
    if (typeof window !== 'undefined') {
        window.addEventListener('pagehide', flushNow);
        document.addEventListener('visibilitychange', onHidden);
    }

    return {
        read(): DraftRecord<T> | null {
            if (!usable) return null;
            let raw: string | null = null;
            try {
                raw = localStorage.getItem(storageKey);
            } catch {
                usable = false;
                return null;
            }
            if (raw === null) return null;
            try {
                const parsed = JSON.parse(raw) as DraftRecord<T>;
                // A shape that is not a draft is not a draft: half-written storage, an older
                // version of this module, or something else's key. Drop it rather than hand the
                // page an object it will read fields off.
                if (!parsed || typeof parsed !== 'object' || typeof parsed.savedAt !== 'string') {
                    this.clear();
                    return null;
                }
                return { ...parsed, dropped: parsed.dropped ?? [], step: parsed.step ?? 0 };
            } catch {
                this.clear();
                return null;
            }
        },

        save(values: T, step: number): void {
            if (!usable) return;
            const dropped: string[] = [];
            pending = {
                values: draftable(values, dropped) as T,
                step,
                savedAt: new Date().toISOString(),
                dropped,
            };
            if (timer !== null) clearTimeout(timer);
            timer = setTimeout(write, wait);
        },

        flush: flushNow,

        clear(): void {
            if (timer !== null) { clearTimeout(timer); timer = null; }
            pending = null;
            try {
                localStorage.removeItem(storageKey);
            } catch {
                usable = false;
            }
        },

        dispose(): void {
            if (timer !== null) { clearTimeout(timer); timer = null; }
            if (typeof window !== 'undefined') {
                window.removeEventListener('pagehide', flushNow);
                document.removeEventListener('visibilitychange', onHidden);
            }
        },
    };
}
