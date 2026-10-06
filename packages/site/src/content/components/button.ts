// Rich component-page content for <pdx-button>. Declarative: the route (component.pdx)
// renders these demos/use-cases; each `src` is rendered live AND shown as source.

export default {
    summary: 'A prop-driven button: 9 semantic variants, 3 sizes, loading and disabled states, '
        + 'icon slots and full-width — over native <button> for full keyboard and form behavior.',

    demos: [
        {
            title: 'Variants',
            description: 'Nine semantic variants via the variant prop.',
            src: `<pdx-button variant="primary">Primary</pdx-button>
<pdx-button variant="secondary">Secondary</pdx-button>
<pdx-button variant="outline">Outline</pdx-button>
<pdx-button variant="ghost">Ghost</pdx-button>
<pdx-button variant="link">Link</pdx-button>
<pdx-button variant="danger">Danger</pdx-button>
<pdx-button variant="success">Success</pdx-button>
<pdx-button variant="warning">Warning</pdx-button>
<pdx-button variant="info">Info</pdx-button>`,
        },
        {
            title: 'Sizes',
            description: 'Three sizes via the size prop: sm, default, lg.',
            src: `<pdx-button variant="primary" size="sm">Small</pdx-button>
<pdx-button variant="primary">Default</pdx-button>
<pdx-button variant="primary" size="lg">Large</pdx-button>`,
        },
        {
            title: 'With icons',
            description: 'Slot content: combine <pdx-icon> with text. The icon inherits the button color.',
            src: `<pdx-button variant="primary"><pdx-icon name="plus" size="sm"></pdx-icon> New Project</pdx-button>
<pdx-button variant="secondary"><pdx-icon name="download" size="sm"></pdx-icon> Export</pdx-button>
<pdx-button variant="outline"><pdx-icon name="filter" size="sm"></pdx-icon> Filter</pdx-button>
<pdx-button variant="danger"><pdx-icon name="trash" size="sm"></pdx-icon> Delete</pdx-button>`,
        },
        {
            title: 'Icon-only',
            description: 'Drop the text for a compact, square icon button.',
            src: `<pdx-button variant="ghost"><pdx-icon name="settings" size="sm"></pdx-icon></pdx-button>
<pdx-button variant="ghost"><pdx-icon name="bell" size="sm"></pdx-icon></pdx-button>
<pdx-button variant="ghost"><pdx-icon name="search" size="sm"></pdx-icon></pdx-button>
<pdx-button variant="outline"><pdx-icon name="more-horizontal" size="sm"></pdx-icon></pdx-button>`,
        },
        {
            title: 'Loading',
            description: 'The loading prop shows a spinner, sets aria-busy and blocks clicks.',
            src: `<pdx-button variant="primary" loading>Saving…</pdx-button>
<pdx-button variant="secondary" loading>Loading…</pdx-button>
<pdx-button variant="danger" loading>Deleting…</pdx-button>`,
        },
        {
            title: 'Disabled',
            description: 'The disabled prop blocks activation at 50% opacity.',
            src: `<pdx-button variant="primary" disabled>Primary</pdx-button>
<pdx-button variant="outline" disabled>Outline</pdx-button>
<pdx-button variant="ghost" disabled>Ghost</pdx-button>`,
        },
        {
            title: 'Toggle',
            description: 'The toggle prop makes a stateful on/off button using aria-pressed.',
            src: `<pdx-button toggle variant="outline" size="sm">B</pdx-button>
<pdx-button toggle variant="outline" size="sm">I</pdx-button>
<pdx-button toggle variant="primary" pressed>Active</pdx-button>`,
        },
        {
            title: 'Full width',
            description: 'The full prop makes a block-level button.',
            src: `<div style="display:flex;flex-direction:column;gap:.5rem;width:100%;max-width:400px">
  <pdx-button variant="primary" full>Full width primary</pdx-button>
  <pdx-button variant="outline" full>Full width outline</pdx-button>
</div>`,
        },
    ],

    useCases: [
        {
            title: 'Confirm deployment',
            description: 'A two-action card: a ghost cancel beside a primary deploy.',
            src: `<div style="max-width:380px;border:1px solid var(--pdx-color-border);border-radius:12px;padding:1.1rem;background:var(--pdx-color-surface)">
  <h3 class="pdx-txt-subheading" style="margin:0 0 .3rem">Confirm deployment</h3>
  <p class="pdx-txt-small pdx-ink-muted" style="margin:0 0 1rem">Deploy v2.5.0 to production? This will affect all users.</p>
  <div style="display:flex;gap:.5rem;justify-content:flex-end">
    <pdx-button variant="ghost">Cancel</pdx-button>
    <pdx-button variant="primary"><pdx-icon name="upload" size="sm"></pdx-icon> Deploy</pdx-button>
  </div>
</div>`,
        },
        {
            title: 'Confirm a destructive action',
            description: "Let's build a confirmation card — a ghost \"keep\" next to a danger \"delete\".",
            src: `<div style="max-width:380px;border:1px solid var(--pdx-color-border);border-radius:12px;padding:1.1rem;background:var(--pdx-color-surface)">
  <h3 class="pdx-txt-subheading" style="margin:0 0 .3rem">Delete repository</h3>
  <p class="pdx-txt-small pdx-ink-muted" style="margin:0 0 1rem">This cannot be undone. All data will be permanently removed.</p>
  <div style="display:flex;gap:.5rem;justify-content:flex-end">
    <pdx-button variant="outline">Keep</pdx-button>
    <pdx-button variant="danger"><pdx-icon name="trash" size="sm"></pdx-icon> Delete forever</pdx-button>
  </div>
</div>`,
        },
        {
            title: 'Dialog action bar',
            description: 'A three-action footer: discard, save draft, publish.',
            src: `<div style="max-width:420px;border:1px solid var(--pdx-color-border);border-radius:12px;padding:1.1rem;background:var(--pdx-color-surface)">
  <h3 class="pdx-txt-subheading" style="margin:0 0 .3rem">Unsaved changes</h3>
  <p class="pdx-txt-small pdx-ink-muted" style="margin:0 0 1rem">You have unsaved changes. What would you like to do?</p>
  <div style="display:flex;gap:.5rem;justify-content:flex-end">
    <pdx-button variant="link">Discard</pdx-button>
    <pdx-button variant="secondary">Save draft</pdx-button>
    <pdx-button variant="primary">Publish</pdx-button>
  </div>
</div>`,
        },
    ],

    a11y: {
        notes: 'Renders a native <button>, so keyboard activation and focus are built in. '
            + 'disabled and loading both block activation; loading also sets aria-busy="true". '
            + 'A toggle button exposes its state via aria-pressed.',
        keyboard: [
            { keys: 'Enter / Space', desc: 'Activate the button' },
            { keys: 'Tab', desc: 'Move focus to the button' },
            { keys: 'Shift + Tab', desc: 'Move focus away' },
        ],
    },
};
