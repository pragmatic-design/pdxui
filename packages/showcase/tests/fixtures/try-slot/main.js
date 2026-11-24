// The try-slot fixture (tests/try-slot.spec.ts, #1365): a compiled .pdx whose template is
// `@try { <slot></slot> } @catch (err, retry) { … }`, around a child that throws while
// `window.__tsThrows` is above zero. `window.__ts` is set once both are defined.
//
// The boundary is defined first: a child defined before it would throw where no boundary is yet.
const { component, html } = await import('@pdxui/core');

window.__tsThrows = window.__tsThrows ?? 1;
window.__tsMounts = 0;

await import('./ts-boundary.pdx');
await customElements.whenDefined('app-ts-boundary');

component('ts-flaky', {
    setup() {
        window.__tsMounts++;
        if (window.__tsThrows > 0) {
            window.__tsThrows--;
            throw new Error('the child failed');
        }
        return {};
    },
    render: () => html`<span class="child">the child</span>`,
});

await customElements.whenDefined('ts-flaky');
window.__ts = { ready: true };
