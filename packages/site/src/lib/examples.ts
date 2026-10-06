// Curated demo snippets per component tag for the component detail page.
// Inline components render with sensible content; overlays render a trigger that opens them.
// Anything not listed falls back to a bare <tag>Demo</tag> in component.pdx.

export const examples: Record<string, string> = {
    'pdx-button': '<pdx-button variant="primary">Primary</pdx-button> <pdx-button variant="outline">Outline</pdx-button> <pdx-button variant="ghost">Ghost</pdx-button>',
    'pdx-badge': '<pdx-badge value="5"></pdx-badge> <pdx-badge value="99" variant="success"></pdx-badge> <pdx-badge dot variant="danger"></pdx-badge>',
    'pdx-chip': '<pdx-chip>Default</pdx-chip> <pdx-chip variant="primary">Primary</pdx-chip>',
    'pdx-kbd': '<pdx-kbd>Ctrl</pdx-kbd> <pdx-kbd>K</pdx-kbd>',
    'pdx-spinner': '<pdx-spinner></pdx-spinner>',
    'pdx-progress': '<pdx-progress value="62" striped style="width:280px"></pdx-progress>',
    'pdx-switch': '<pdx-switch label="Enable notifications"></pdx-switch>',
    'pdx-slider': '<pdx-slider value="40" style="width:280px"></pdx-slider>',
    'pdx-rating': '<pdx-rating value="3"></pdx-rating>',
    'pdx-input': '<pdx-input placeholder="Type here…" style="width:280px"></pdx-input>',
    'pdx-textarea': '<pdx-textarea placeholder="Your message…" style="width:280px"></pdx-textarea>',
    'pdx-checkbox': '<pdx-checkbox label="I agree"></pdx-checkbox>',
    'pdx-radio': '<pdx-radio label="Choose me"></pdx-radio>',
    'pdx-segmented': '<pdx-segmented value="a" options=\'[{"label":"Day","value":"a"},{"label":"Week","value":"b"},{"label":"Month","value":"c"}]\'></pdx-segmented>',
    'pdx-card': '<pdx-card style="max-width:320px"><strong>Card title</strong><p>Some card content goes here.</p></pdx-card>',
    'pdx-banner': '<pdx-banner variant="info">Heads up — this is a banner.</pdx-banner>',
    'pdx-avatar': '<pdx-avatar name="Ada Lovelace"></pdx-avatar>',
    'pdx-divider': '<div style="width:280px"><pdx-divider></pdx-divider></div>',
    'pdx-tooltip': '<pdx-tooltip text="Hello!"><pdx-button>Hover me</pdx-button></pdx-tooltip>',
    'pdx-dialog': '<pdx-button variant="primary" onclick="this.parentElement.querySelector(\'pdx-dialog\').open=true">Open dialog</pdx-button> <pdx-dialog title="Hello from PDX"><p>This is a modal dialog. Press Escape or click the backdrop to close.</p></pdx-dialog>',
    'pdx-drawer': '<pdx-button variant="primary" onclick="this.parentElement.querySelector(\'pdx-drawer\').open=true">Open drawer</pdx-button> <pdx-drawer title="Drawer"><p>Drawer content.</p></pdx-drawer>',
    'pdx-alert-dialog': '<pdx-button variant="danger" onclick="this.parentElement.querySelector(\'pdx-alert-dialog\').open=true">Delete…</pdx-button> <pdx-alert-dialog title="Are you sure?">This action cannot be undone.</pdx-alert-dialog>',
};
