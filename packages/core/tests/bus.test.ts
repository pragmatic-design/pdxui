import { describe, it, expect } from 'vitest';
import { createBus } from '../src/reactivity/bus';

type TestEvents = {
    'cart:add': { productId: number; qty: number };
    'cart:remove': { productId: number };
    'auth:login': { userId: string };
    'auth:logout': void;
};

describe('createBus', () => {
    it('emits and receives events', () => {
        const bus = createBus<TestEvents>();
        let received: { productId: number; qty: number } | null = null;
        bus.on('cart:add', (v) => { received = v; });
        bus.emit('cart:add', { productId: 1, qty: 2 });
        expect(received).toEqual({ productId: 1, qty: 2 });
    });

    it('returns unsubscribe function from on()', () => {
        const bus = createBus<TestEvents>();
        let count = 0;
        const unsub = bus.on('cart:add', () => { count++; });

        bus.emit('cart:add', { productId: 1, qty: 1 });
        expect(count).toBe(1);

        unsub();
        bus.emit('cart:add', { productId: 2, qty: 1 });
        expect(count).toBe(1);
    });

    it('off() removes a specific handler', () => {
        const bus = createBus<TestEvents>();
        let count = 0;
        const handler = () => { count++; };

        bus.on('cart:add', handler);
        bus.emit('cart:add', { productId: 1, qty: 1 });
        expect(count).toBe(1);

        bus.off('cart:add', handler);
        bus.emit('cart:add', { productId: 2, qty: 1 });
        expect(count).toBe(1);
    });

    it('supports multiple handlers on same event', () => {
        const bus = createBus<TestEvents>();
        const results: string[] = [];

        bus.on('auth:login', (v) => results.push('a:' + v.userId));
        bus.on('auth:login', (v) => results.push('b:' + v.userId));
        bus.emit('auth:login', { userId: 'u1' });
        expect(results).toEqual(['a:u1', 'b:u1']);
    });

    it('events are independent — different channels', () => {
        const bus = createBus<TestEvents>();
        let addCount = 0;
        let removeCount = 0;

        bus.on('cart:add', () => { addCount++; });
        bus.on('cart:remove', () => { removeCount++; });

        bus.emit('cart:add', { productId: 1, qty: 1 });
        expect(addCount).toBe(1);
        expect(removeCount).toBe(0);
    });

    it('emits void events without payload', () => {
        const bus = createBus<TestEvents>();
        let triggered = false;
        bus.on('auth:logout', () => { triggered = true; });
        bus.emit('auth:logout');
        expect(triggered).toBe(true);
    });

    it('no error emitting to event with no handlers', () => {
        const bus = createBus<TestEvents>();
        expect(() => bus.emit('cart:add', { productId: 1, qty: 1 })).not.toThrow();
    });
});

describe('createBus with store', () => {
    it('records event history', () => {
        const bus = createBus<TestEvents>({ store: true });

        bus.emit('cart:add', { productId: 1, qty: 2 });
        bus.emit('cart:add', { productId: 3, qty: 1 });

        const history = bus.history();
        expect(history.length).toBe(2);
        expect(history[0].event).toBe('cart:add');
        expect(history[0].payload).toEqual({ productId: 1, qty: 2 });
        expect(history[1].payload).toEqual({ productId: 3, qty: 1 });
        expect(typeof history[0].timestamp).toBe('number');
    });

    it('replay re-emits stored events to current handlers', () => {
        const bus = createBus<TestEvents>({ store: true });

        // Emit before handlers registered
        bus.emit('cart:add', { productId: 1, qty: 1 });
        bus.emit('cart:add', { productId: 2, qty: 3 });

        // Late subscriber
        const received: number[] = [];
        bus.on('cart:add', (v) => received.push(v.productId));

        // Replay catches up
        bus.replay();
        expect(received).toEqual([1, 2]);
    });

    it('clear empties event history', () => {
        const bus = createBus<TestEvents>({ store: true });
        bus.emit('cart:add', { productId: 1, qty: 1 });
        expect(bus.history().length).toBe(1);

        bus.clear();
        expect(bus.history().length).toBe(0);
    });

    it('history returns empty array without store', () => {
        const bus = createBus<TestEvents>();
        bus.emit('cart:add', { productId: 1, qty: 1 });
        expect(bus.history()).toEqual([]);
    });

    it('replay is no-op without store', () => {
        const bus = createBus<TestEvents>();
        let count = 0;
        bus.on('cart:add', () => { count++; });
        bus.emit('cart:add', { productId: 1, qty: 1 });
        expect(count).toBe(1);

        bus.replay(); // no-op, no stored events
        expect(count).toBe(1);
    });

    it('history returns copies (immutable)', () => {
        const bus = createBus<TestEvents>({ store: true });
        bus.emit('cart:add', { productId: 1, qty: 1 });

        const h1 = bus.history();
        const h2 = bus.history();
        expect(h1).not.toBe(h2);
        expect(h1).toEqual(h2);
    });
});

describe('untyped bus', () => {
    it('works without type parameter', () => {
        const bus = createBus();
        let received: unknown = null;

        bus.on('anything', (v) => { received = v; });
        bus.emit('anything', { foo: 'bar' });
        expect(received).toEqual({ foo: 'bar' });
    });
});
