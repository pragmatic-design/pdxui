// Tests for debug ecosystem: signal naming, effect tracer, component tree, DevTools

import { describe, it, expect, beforeEach } from 'vitest';
import { signal, effect } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';
import { component } from '../src/component/component';
import { __pdx_debug, setTelemetryLevel } from '../src/debug/inspector';

// Enable full telemetry for debug tests
beforeEach(() => setTelemetryLevel(2));

describe('signal naming + inspector', () => {
    it('named signal appears in __pdx_debug.signals()', () => {
        signal(42, { name: 'count' });
        const signals = __pdx_debug.signals();
        const found = signals.find(s => s.name === 'count');

        expect(found).toBeDefined();
        expect(found!.value).toBe(42);
    });

    it('tracks subscriber count', () => {
        const val = signal(0, { name: 'tracked' });
        effect(() => { val(); });
        effect(() => { val(); });

        const found = __pdx_debug.signals().find(s => s.name === 'tracked');
        expect(found!.subscriberCount).toBeGreaterThanOrEqual(2);
    });

    it('unnamed signals do not appear in registry', () => {
        const before = __pdx_debug.signals().length;
        signal(0); // unnamed
        const after = __pdx_debug.signals().length;
        expect(after).toBe(before);
    });

    it('signal value updates reflected in inspector', () => {
        const val = signal('initial', { name: 'dynamic' });
        val.set('updated');
        const found = __pdx_debug.signals().find(s => s.name === 'dynamic');
        expect(found!.value).toBe('updated');
    });
});

describe('effect tracer', () => {
    it('captures trace when enabled', () => {
        __pdx_debug.clearTrace();
        __pdx_debug.trace(true);

        const count = signal(0, { name: 'traceCount' });
        effect(() => { count(); });

        count.set(1);
        count.set(2);

        __pdx_debug.trace(false);

        const log = __pdx_debug.traceLog();
        expect(log.length).toBeGreaterThanOrEqual(2);
        expect(log.some(e => e.trigger === 'traceCount')).toBe(true);
        expect(log.some(e => e.newValue === 2)).toBe(true);
    });

    it('does not capture when tracing disabled', () => {
        __pdx_debug.clearTrace();
        __pdx_debug.trace(false);

        const val = signal(0, { name: 'noTrace' });
        val.set(1);

        expect(__pdx_debug.traceLog().length).toBe(0);
    });

    it('clearTrace empties the log', () => {
        __pdx_debug.trace(true);
        const val = signal(0, { name: 'clearMe' });
        effect(() => { val(); }); // subscriber needed for trace
        val.set(1);
        __pdx_debug.trace(false);

        expect(__pdx_debug.traceLog().length).toBeGreaterThan(0);
        __pdx_debug.clearTrace();
        expect(__pdx_debug.traceLog().length).toBe(0);
    });
});

describe('component tree', () => {
    let tagId = 400;
    beforeEach(() => { document.body.innerHTML = ''; });

    it('detects mounted custom elements', () => {
        const tag = `test-debug-${tagId++}`;
        component(tag, {
            render: () => html`<span>Debug</span>`,
        });

        const el = document.createElement(tag);
        document.body.appendChild(el);

        const tree = __pdx_debug.componentTree();
        expect(tree.some(c => c.tag === tag)).toBe(true);
    });

    it('includes attributes as props', () => {
        const tag = `test-debug-${tagId++}`;
        component(tag, {
            props: { label: { type: String, default: '' } },
            render: () => html`<span>Test</span>`,
        });

        const el = document.createElement(tag);
        el.setAttribute('label', 'Hello');
        document.body.appendChild(el);

        const tree = __pdx_debug.componentTree();
        const comp = tree.find(c => c.tag === tag);
        expect(comp?.props.label).toBe('Hello');
    });

    it('removes component from tree on disconnect', () => {
        const tag = `test-debug-${tagId++}`;
        component(tag, {
            render: () => html`<span>Temp</span>`,
        });

        const el = document.createElement(tag);
        document.body.appendChild(el);
        expect(__pdx_debug.componentTree().some(c => c.tag === tag)).toBe(true);

        document.body.removeChild(el);
        expect(__pdx_debug.componentTree().some(c => c.tag === tag)).toBe(false);
    });
});

describe('DevTools protocol', () => {
    it('window.__PDX_DEVTOOLS__ is exposed', () => {
        expect((window as any).__PDX_DEVTOOLS__).toBeDefined();
        expect((window as any).__PDX_DEVTOOLS__.debug).toBe(__pdx_debug);
    });

    it('connect() accepts a hook', () => {
        const events: { event: string; payload: unknown }[] = [];
        (window as any).__PDX_DEVTOOLS__.connect({
            emit(event: string, payload: unknown) {
                events.push({ event, payload });
            },
        });

        const val = signal(0, { name: 'devtools-test' });
        val.set(1);

        expect(events.some(e => e.event === 'signal:change')).toBe(true);
        const change = events.find(e => e.event === 'signal:change');
        expect((change!.payload as any).name).toBe('devtools-test');
    });
});
