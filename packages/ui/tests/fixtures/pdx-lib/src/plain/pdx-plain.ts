// The control beside the .pdx probe: a component written in TypeScript, built by the same config.
import { component, html, prop } from '@pdxui/core';

component('pdx-plain', {
    props: { label: prop('plain') },
    render: (ctx) => html`<span>${ctx.label}</span>`,
});
