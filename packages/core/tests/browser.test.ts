// Tests for Browser Integration composables.

import { describe, it, expect, beforeEach } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { useStorage } from '../src/browser/storage';
import { useOnline } from '../src/browser/online';
import { useTitle } from '../src/browser/title';
import { useMediaQuery } from '../src/browser/media-query';

describe('useStorage()', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it('returns default value when key does not exist', () => {
        const value = useStorage('nonexistent', 42);
        expect(value()).toBe(42);
    });

    it('reads existing value from localStorage', () => {
        localStorage.setItem('test-key', JSON.stringify('stored'));
        const value = useStorage('test-key', 'default');
        expect(value()).toBe('stored');
    });

    it('writes to localStorage on signal change', () => {
        const value = useStorage('write-test', 'initial');
        expect(value()).toBe('initial');

        value.set('updated');
        expect(JSON.parse(localStorage.getItem('write-test')!)).toBe('updated');
    });

    it('supports objects', () => {
        const value = useStorage('obj-test', { name: 'Alice', age: 30 });
        expect(value()).toEqual({ name: 'Alice', age: 30 });

        value.set({ name: 'Bob', age: 25 });
        expect(JSON.parse(localStorage.getItem('obj-test')!)).toEqual({ name: 'Bob', age: 25 });
    });

    it('supports sessionStorage', () => {
        const value = useStorage('session-test', 'hello', 'session');
        value.set('world');
        expect(JSON.parse(sessionStorage.getItem('session-test')!)).toBe('world');
        expect(localStorage.getItem('session-test')).toBeNull();
    });

    it('handles invalid JSON in storage gracefully', () => {
        localStorage.setItem('bad-json', '{invalid');
        const value = useStorage('bad-json', 'fallback');
        expect(value()).toBe('fallback');
    });
});

describe('useOnline()', () => {
    it('returns a boolean signal', () => {
        const online = useOnline();
        expect(typeof online()).toBe('boolean');
    });
});

describe('useTitle()', () => {
    it('sets document.title reactively', () => {
        const count = signal(5);
        useTitle(() => `${count()} items`);
        expect(document.title).toBe('5 items');

        count.set(10);
        expect(document.title).toBe('10 items');
    });
});

describe('useMediaQuery()', () => {
    it('returns a boolean signal', () => {
        const result = useMediaQuery('(min-width: 0px)');
        expect(typeof result()).toBe('boolean');
    });
});
