// A unit suite may not touch the network, and this file says so.
//
// happy-dom gives the document a default URL of http://localhost:3000, so a relative URL handed to
// an unmocked `fetch` resolves against that origin and the runtime really opens a socket. With
// nothing listening, the promise rejects, the test's own expectation is satisfied — and every run
// prints several ~25-line ECONNREFUSED AggregateErrors to stderr while staying green.
//
// Two costs, neither of them "a failing test":
//
//   1. On a machine where something IS listening on 3000 — a dev server, another project — the
//      test reaches it instead of failing to connect, and what it asserts depends on what answered.
//      That is a unit test whose result is a property of the machine.
//   2. The noise buries real output. Twenty-five lines per rejection, several per run, is enough
//      scroll to lose a genuine failure in.
//
// So the global is replaced with one that refuses, by name. A test that means to use fetch stubs it
// (`vi.stubGlobal('fetch', …)`) and never sees this; a test that forgot gets a message saying so
// instead of a socket. `vi.unstubAllGlobals()` restores THIS function, not the runtime's, because
// this file runs before any test does.

/** Thrown when a test reaches the network. Named so the failure reads as what it is. */
export class UnmockedFetchError extends Error {
    constructor(url: string) {
        super(
            `A test called fetch(${url}) without stubbing it. The core unit suite does not use the `
            + 'network: stub it for this test — vi.stubGlobal(\'fetch\', vi.fn(...)) — or move the '
            + 'case to a suite that has a server.',
        );
        this.name = 'UnmockedFetchError';
    }
}

function refuse(input: unknown): never {
    const url = typeof input === 'string' ? input
        : input instanceof Request ? input.url
            : String(input);
    throw new UnmockedFetchError(url);
}

// Assigned once, at module scope. That makes it the value vitest treats as the original, so
// `vi.unstubAllGlobals()` restores the guard rather than the runtime's fetch — a test that stubs
// and cleans up leaves the next one protected. Each test file gets its own module instance, so a
// stub cannot leak across files either.
globalThis.fetch = refuse as unknown as typeof fetch;
