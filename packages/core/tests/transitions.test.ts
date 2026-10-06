import { describe, it, expect, beforeEach } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';
import { when } from '../src/renderer/helpers';
import { enter, exit, injectTransitionCSS } from '../src/renderer/transitions';

describe('transitions', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    describe('enter()', () => {
        it('adds pdx-{name} and pdx-enter-from classes initially', () => {
            const el = document.createElement('div');
            document.body.appendChild(el);

            enter(el, 'fade-in');

            // After microtask, should have enter-active
            expect(el.classList.contains('pdx-fade-in')).toBe(true);
            expect(el.classList.contains('pdx-enter-active')).toBe(true);
        });

        it('resolves immediately for non-HTMLElement nodes', async () => {
            const text = document.createTextNode('hello');
            await enter(text, 'fade-in'); // should not throw
        });

        it('resolves immediately when no animation specified', async () => {
            const el = document.createElement('div');
            await enter(el); // undefined animation
        });
    });

    describe('exit()', () => {
        it('removes node when no animation specified', async () => {
            const el = document.createElement('div');
            document.body.appendChild(el);
            expect(document.body.contains(el)).toBe(true);

            await exit(el);
            expect(document.body.contains(el)).toBe(false);
        });

        it('adds exit classes before removing', () => {
            const el = document.createElement('div');
            document.body.appendChild(el);

            exit(el, 'fade-out');

            expect(el.classList.contains('pdx-fade-out')).toBe(true);
            expect(el.classList.contains('pdx-exit-active')).toBe(true);
        });

        it('resolves immediately for text nodes', async () => {
            const text = document.createTextNode('bye');
            document.body.appendChild(text);
            await exit(text, 'fade-out');
            expect(document.body.contains(text)).toBe(false);
        });
    });

    describe('injectTransitionCSS()', () => {
        it('injects style element into head', () => {
            injectTransitionCSS();
            const styles = document.head.querySelectorAll('style');
            const hasTransitions = Array.from(styles).some(s =>
                s.textContent?.includes('pdx-fade-in')
            );
            expect(hasTransitions).toBe(true);
        });
    });

    describe('when() with transitions', () => {
        it('accepts transition options without error', () => {
            const show = signal(true);
            const frag = when(
                () => show(),
                () => html`<div class="content">Hello</div>`,
                null,
                { enter: 'fade-in', exit: 'fade-out' }
            );
            document.body.appendChild(frag);
            expect(document.body.querySelector('.content')).not.toBeNull();
        });

        it('inserts new content when condition changes', () => {
            const show = signal(false);
            const frag = when(
                () => show(),
                () => html`<div class="show">Visible</div>`,
                null,
                { enter: 'fade-in', exit: 'fade-out' }
            );
            document.body.appendChild(frag);
            expect(document.body.querySelector('.show')).toBeNull();

            show.set(true);
            expect(document.body.querySelector('.show')).not.toBeNull();
        });

        it('enter transition adds classes on new content', () => {
            const show = signal(false);
            const frag = when(
                () => show(),
                () => html`<div class="animated">Content</div>`,
                null,
                { enter: 'slide-right' }
            );
            document.body.appendChild(frag);

            show.set(true);
            const el = document.body.querySelector('.animated') as HTMLElement;
            expect(el).not.toBeNull();
            // enter() applied classes
            expect(el.classList.contains('pdx-enter-active')).toBe(true);
        });
    });
});
