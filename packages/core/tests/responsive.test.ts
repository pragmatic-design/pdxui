import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effect } from '../src/reactivity/signal';
import { responsive } from '../src/component/responsive';

describe('responsive', () => {
    let listeners: Map<string, Set<() => void>>;
    let matchResults: Map<string, boolean>;

    beforeEach(() => {
        listeners = new Map();
        matchResults = new Map();

        // Mock matchMedia — returns objects that read from matchResults
        vi.stubGlobal('matchMedia', (query: string) => ({
            matches: matchResults.get(query) ?? false,
            media: query,
            addEventListener: (_event: string, handler: () => void) => {
                if (!listeners.has(query)) listeners.set(query, new Set());
                listeners.get(query)!.add(handler);
            },
            removeEventListener: () => {},
        }));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    /** Simulate viewport change — update match status and fire listeners. */
    function setViewport(matchMap: Record<string, boolean>) {
        for (const [query, matches] of Object.entries(matchMap)) {
            matchResults.set(query, matches);
        }
        // Fire all listeners (resolve() re-evaluates everything)
        listeners.forEach(set => set.forEach(fn => fn()));
    }

    it('returns smallest breakpoint value when no breakpoints match', () => {
        const cols = responsive({ sm: 1, md: 2, lg: 3 });
        expect(cols()).toBe(1);
    });

    it('returns base value when provided and no breakpoints match', () => {
        const cols = responsive({ md: 2, lg: 3 }, 1);
        expect(cols()).toBe(1);
    });

    it('returns largest matching breakpoint', () => {
        matchResults.set('(min-width: 640px)', true);
        matchResults.set('(min-width: 768px)', true);

        const cols = responsive({ sm: 1, md: 2, lg: 3 });
        expect(cols()).toBe(2);
    });

    it('returns xl value when all up to xl match', () => {
        matchResults.set('(min-width: 640px)', true);
        matchResults.set('(min-width: 768px)', true);
        matchResults.set('(min-width: 1024px)', true);
        matchResults.set('(min-width: 1280px)', true);

        const cols = responsive({ sm: 1, md: 2, lg: 3, xl: 4 });
        expect(cols()).toBe(4);
    });

    it('updates reactively when breakpoint changes', () => {
        const cols = responsive({ sm: 1, md: 2, lg: 3 });
        expect(cols()).toBe(1);

        // Grow to md
        setViewport({
            '(min-width: 640px)': true,
            '(min-width: 768px)': true,
        });
        expect(cols()).toBe(2);

        // Grow to lg
        setViewport({
            '(min-width: 1024px)': true,
        });
        expect(cols()).toBe(3);
    });

    it('tracks as dependency in effects', () => {
        const cols = responsive({ sm: 1, md: 2 });
        const values: number[] = [];
        effect(() => { values.push(cols() as number); });

        expect(values).toEqual([1]);

        setViewport({
            '(min-width: 640px)': true,
            '(min-width: 768px)': true,
        });
        expect(values).toEqual([1, 2]);
    });

    it('throws when no breakpoints provided', () => {
        expect(() => responsive({})).toThrow('at least one breakpoint');
    });

    it('peek reads without tracking', () => {
        const cols = responsive({ sm: 1, md: 2 });
        expect(cols.peek()).toBe(1);
    });

    it('works with non-number values', () => {
        const layout = responsive({ sm: 'stack', lg: 'row' });
        expect(layout()).toBe('stack');

        setViewport({
            '(min-width: 640px)': true,
            '(min-width: 1024px)': true,
        });
        expect(layout()).toBe('row');
    });
});
