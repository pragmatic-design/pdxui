// An employee's documents, loaded once, by the employee route (CD-D1).
//
// The route shows their count and the «expired» dot on its menu, and the documents section shows
// the list. If each fetched it there would be two requests on landing and two copies, and after an
// upload the count would stay where it was until the next navigation.
//
// The route owns the list and provides it (`@provide employeeDocuments`); the section injects it and
// asks the owner to read it again after a change.
//
// Only the route imports this module; the section reaches it through the inject, `url` included. A
// module both import is a chunk of its own, and the entry names it in its preload map, and that puts
// the blocking bytes at the budget's ceiling (82.0 of 82).
import { signal } from '@pdxui/core';
import type { ReadonlySignal } from '@pdxui/core';

/** A document as `/api/attachments` lists it. */
export interface EmployeeDocument {
    id: number;
    name: string;
    label: string;
    /** `YYYY-MM-DD`, or '' for one that does not expire. */
    expires: string;
}

export interface EmployeeDocuments {
    /** The list, as the server last answered. */
    documents: ReadonlySignal<EmployeeDocument[]>;
    /** False until the first list arrives: the void state is an answer, not the wait for one. */
    loaded: ReadonlySignal<boolean>;
    /** The documents' own address, which the upload posts to as well. */
    url(): string;
    /** Ask the server again. The id is read before the request, so a caller in an effect follows it. */
    reload(): Promise<void>;
}

export function createEmployeeDocuments(employeeId: () => string): EmployeeDocuments {
    const documents = signal<EmployeeDocument[]>([]);
    const loaded = signal(false);
    const url = (): string => `/api/attachments?employee=${encodeURIComponent(employeeId())}`;
    /** The last request asked: an answer to any earlier one is out of date when it lands. */
    let latest = 0;
    return {
        documents,
        loaded,
        url,
        async reload() {
            // No id, no list: the route's prop has not arrived. Asked anyway, `?employee=` answers
            // with nothing, and when that answer lands AFTER the real one it empties the list.
            if (!employeeId()) return;
            const asked = ++latest;
            const res = await fetch(url());
            const list = await res.json() as EmployeeDocument[];
            // Answers land in any order; only the newest request's is the list.
            if (asked !== latest) return;
            documents.set(list);
            loaded.set(true);
        },
    };
}
